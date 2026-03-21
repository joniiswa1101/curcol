import { Router } from "express";
import {
  db, messagesTable, conversationMembersTable, conversationsTable,
  attachmentsTable, messageReactionsTable, usersTable, cicoStatusTable, messageReadsTable, messageFavoritesTable,
  complianceFlagsTable
} from "@workspace/db";
import { eq, and, lt, desc, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { logAudit } from "../lib/audit.js";
import { broadcastToConversation } from "../lib/websocket.js";
import { sendWhatsAppMessage } from "../lib/whatsapp.js";
import { sanitizeUser } from "../lib/sanitize.js";
import { detectPII, redactContent } from "../lib/compliance.js";

const router = Router();

async function getConversationMemberIds(conversationId: number): Promise<number[]> {
  const members = await db.select({ userId: conversationMembersTable.userId })
    .from(conversationMembersTable)
    .where(eq(conversationMembersTable.conversationId, conversationId));
  return members.map(m => m.userId);
}

// BATCHED enrichment - includes read receipts (5 queries total regardless of message count)
async function enrichMessages(msgs: any[]) {
  if (msgs.length === 0) return [];

  const senderIds = [...new Set(msgs.map(m => m.senderId).filter((id): id is number => id != null))];
  const msgIds = msgs.map(m => m.id).filter((id): id is number => id != null);

  const [senders, attachments, reactions, reads] = await Promise.all([
    senderIds.length > 0
      ? db.select().from(usersTable).where(inArray(usersTable.id, senderIds))
      : Promise.resolve([]),
    db.select().from(attachmentsTable).where(inArray(attachmentsTable.messageId as any, msgIds)),
    db.select().from(messageReactionsTable).where(inArray(messageReactionsTable.messageId as any, msgIds)),
    msgIds.length > 0
      ? db.select().from(messageReadsTable).where(inArray(messageReadsTable.messageId as any, msgIds))
      : Promise.resolve([]),
  ]);

  const employeeIds = senders.map(s => s.employeeId).filter(Boolean);
  const cicoStatuses = employeeIds.length > 0
    ? await db.select().from(cicoStatusTable).where(inArray(cicoStatusTable.employeeId, employeeIds))
    : [];

  const senderMap = new Map(senders.map(s => [s.id, s]));
  const cicoMap = new Map(cicoStatuses.map(c => [c.employeeId, c]));

  const attachmentsByMsg = new Map<number, any[]>();
  for (const att of attachments) {
    if (att.messageId == null) continue;
    if (!attachmentsByMsg.has(att.messageId)) attachmentsByMsg.set(att.messageId, []);
    attachmentsByMsg.get(att.messageId)!.push(att);
  }

  const reactionsByMsg = new Map<number, any[]>();
  for (const r of reactions) {
    if (r.messageId == null) continue;
    if (!reactionsByMsg.has(r.messageId)) reactionsByMsg.set(r.messageId, []);
    reactionsByMsg.get(r.messageId)!.push(r);
  }

  const readsByMsg = new Map<number, any[]>();
  for (const read of reads) {
    if (read.messageId == null) continue;
    if (!readsByMsg.has(read.messageId)) readsByMsg.set(read.messageId, []);
    readsByMsg.get(read.messageId)!.push(read);
  }

  const replyToIds = msgs.map(m => m.replyToId).filter((id): id is number => id != null);
  const conversationIds = [...new Set(msgs.map(m => m.conversationId).filter(Boolean))];
  let replyMessages: any[] = [];
  if (replyToIds.length > 0) {
    const uniqueReplyIds = [...new Set(replyToIds)];
    const rawReplies = await db.select().from(messagesTable)
      .where(and(
        inArray(messagesTable.id, uniqueReplyIds),
        conversationIds.length > 0 ? inArray(messagesTable.conversationId, conversationIds) : undefined
      ) as any);
    const replySenderIds = [...new Set(rawReplies.map(r => r.senderId).filter(Boolean))];
    const replySenders = replySenderIds.length > 0
      ? await db.select().from(usersTable).where(inArray(usersTable.id, replySenderIds as number[]))
      : [];
    const replySenderMap = new Map(replySenders.map(s => [s.id, s]));
    replyMessages = rawReplies.map(r => {
      const s = replySenderMap.get(r.senderId);
      return { ...r, sender: s ? sanitizeUser(s) : null };
    });
  }
  const replyMap = new Map(replyMessages.map(r => [r.id, r]));

  return msgs.map(msg => {
    const sender = senderMap.get(msg.senderId);
    const cicoStatus = sender ? cicoMap.get(sender.employeeId) || null : null;
    const msgAttachments = attachmentsByMsg.get(msg.id) || [];
    const msgReactions = reactionsByMsg.get(msg.id) || [];
    const msgReads = readsByMsg.get(msg.id) || [];

    const reactionMap: Record<string, { emoji: string; count: number; userIds: number[] }> = {};
    for (const r of msgReactions) {
      if (!reactionMap[r.emoji]) reactionMap[r.emoji] = { emoji: r.emoji, count: 0, userIds: [] };
      reactionMap[r.emoji].count++;
      reactionMap[r.emoji].userIds.push(r.userId);
    }

    return {
      ...msg,
      sender: sender ? { ...sanitizeUser(sender), cicoStatus } : null,
      attachments: msgAttachments,
      reactions: Object.values(reactionMap),
      reads: msgReads,
      replyTo: msg.replyToId ? replyMap.get(msg.replyToId) || null : null,
    };
  });
}

router.get("/:conversationId/messages", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const currentUser = (req as any).user;
  const before = req.query.before ? parseInt(req.query.before as string) : undefined;
  const limit = Math.min(parseInt(req.query.limit as string || "50"), 100);

  const [membership] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  if (!membership) { res.status(403).json({ error: "forbidden" }); return; }

  const conditions: any[] = [eq(messagesTable.conversationId, convId)];
  if (before) conditions.push(lt(messagesTable.id, before));

  const messages = await db.select().from(messagesTable)
    .where(and(...conditions))
    .orderBy(desc(messagesTable.createdAt))
    .limit(limit + 1);

  const hasMore = messages.length > limit;
  const slice = messages.slice(0, limit);

  // Batch enrich — single set of queries for all messages
  const enriched = await enrichMessages(slice);

  // Update last read in background (don't await)
  db.update(conversationMembersTable).set({ lastReadAt: new Date() })
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)))
    .catch(() => {});

  res.json({ messages: enriched.reverse(), hasMore });
});

router.post("/:conversationId/messages", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const currentUser = (req as any).user;
  const { content, type = "text", replyToId, attachmentIds } = req.body;

  const [membership] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  if (!membership) { res.status(403).json({ error: "forbidden" }); return; }

  let validatedReplyToId: number | null = null;
  if (replyToId) {
    const [replyMsg] = await db.select({ id: messagesTable.id })
      .from(messagesTable)
      .where(and(eq(messagesTable.id, replyToId), eq(messagesTable.conversationId, convId)));
    if (replyMsg) validatedReplyToId = replyMsg.id;
  }

  if (content && type === "text") {
    const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, convId));
    const piiResult = detectPII(content);

    if (piiResult.hasPII && (conv?.type === "group" || conv?.type === "announcement")) {
      await db.insert(complianceFlagsTable).values({
        conversationId: convId,
        userId: currentUser.id,
        flagType: "blocked",
        piiTypes: piiResult.piiTypes,
        originalContent: content,
        redactedContent: redactContent(content),
        severity: piiResult.severity,
        status: "pending",
        createdAt: new Date(),
      });
      await logAudit({ userId: currentUser.id, action: "compliance_block_pii", entityType: "message", entityId: 0, details: { piiTypes: piiResult.piiTypes, conversationType: conv?.type }, req });
      res.status(400).json({
        error: "pii_blocked",
        message: "Pesan mengandung data sensitif (PII) dan tidak dapat dikirim ke channel publik.",
        piiTypes: piiResult.piiTypes,
        severity: piiResult.severity,
      });
      return;
    }

  }

  const piiScanResult = (content && type === "text") ? detectPII(content) : null;

  const [msg] = await db.insert(messagesTable).values({
    conversationId: convId,
    senderId: currentUser.id,
    content: content || null,
    type,
    replyToId: validatedReplyToId,
    createdAt: new Date(),
  }).returning();

  if (piiScanResult && (piiScanResult.hasPII || piiScanResult.isRisky)) {
    db.insert(complianceFlagsTable).values({
      messageId: msg.id,
      conversationId: convId,
      userId: currentUser.id,
      flagType: piiScanResult.hasPII ? "pii_detected" : "risky_content",
      piiTypes: piiScanResult.hasPII ? piiScanResult.piiTypes : piiScanResult.riskyKeywords,
      originalContent: content,
      redactedContent: piiScanResult.hasPII ? redactContent(content) : content,
      severity: piiScanResult.severity,
      status: "pending",
      createdAt: new Date(),
    }).catch(err => console.error("Compliance flag insert error:", err));
  }

  if (attachmentIds && attachmentIds.length > 0) {
    await db.update(attachmentsTable).set({ messageId: msg.id }).where(inArray(attachmentsTable.id, attachmentIds));
  }

  // Update conversation timestamp
  db.update(conversationsTable).set({ updatedAt: new Date() })
    .where(eq(conversationsTable.id, convId)).catch(() => {});

  await logAudit({ userId: currentUser.id, action: "send_message", entityType: "message", entityId: msg.id, req });

  // Send via WhatsApp if this is a WhatsApp conversation
  const [conversation] = await db.select().from(conversationsTable)
    .where(eq(conversationsTable.id, convId));
  if (conversation?.type === "whatsapp" && conversation?.whatsappContactPhone && content) {
    sendWhatsAppMessage(conversation.whatsappContactPhone, content).catch(err => {
      console.error(`⚠️ Failed to send WhatsApp message for msg ${msg.id}:`, err);
    });
  }

  const [enriched] = await enrichMessages([msg]);
  const memberIds = await getConversationMemberIds(convId);
  broadcastToConversation(convId, memberIds, { type: "new_message", conversationId: convId, data: enriched });

  res.status(201).json(enriched);
});

router.get("/:conversationId/pinned", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const pinned = await db.select().from(messagesTable)
    .where(and(eq(messagesTable.conversationId, convId), eq(messagesTable.isPinned, true)));
  const enriched = await enrichMessages(pinned);
  res.json({ messages: enriched, hasMore: false });
});

router.post("/:conversationId/typing", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const currentUser = (req as any).user;
  const [membership] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  if (!membership) { res.status(403).json({ error: "forbidden" }); return; }
  const memberIds = await getConversationMemberIds(convId);
  broadcastToConversation(convId, memberIds, {
    type: "typing_indicator",
    data: { userId: currentUser.id, userName: currentUser.name, isTyping: true }
  });
  res.json({ success: true });
});

router.post("/:conversationId/typing/stop", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const currentUser = (req as any).user;
  const [membership] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  if (!membership) { res.status(403).json({ error: "forbidden" }); return; }
  const memberIds = await getConversationMemberIds(convId);
  broadcastToConversation(convId, memberIds, {
    type: "typing_indicator",
    data: { userId: currentUser.id, userName: currentUser.name, isTyping: false }
  });
  res.json({ success: true });
});

router.patch("/:conversationId/messages/:messageId", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const msgId = parseInt(req.params.messageId);
  const currentUser = (req as any).user;
  const { content } = req.body;

  if (!content || typeof content !== "string") {
    res.status(400).json({ error: "Content required" });
    return;
  }

  const [message] = await db.select().from(messagesTable).where(eq(messagesTable.id, msgId));
  if (!message) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  if (message.conversationId !== convId) {
    res.status(404).json({ error: "Message not found in this conversation" });
    return;
  }

  if (message.senderId !== currentUser.id) {
    res.status(403).json({ error: "Can only edit own messages" });
    return;
  }

  const [membership] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  if (!membership) { res.status(403).json({ error: "forbidden" }); return; }

  const editContent = content.trim();
  const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, convId));
  const editPiiResult = detectPII(editContent);

  if (editPiiResult.hasPII && (conv?.type === "group" || conv?.type === "announcement")) {
    db.insert(complianceFlagsTable).values({
      messageId: msgId,
      conversationId: convId,
      userId: currentUser.id,
      flagType: "blocked",
      piiTypes: editPiiResult.piiTypes,
      originalContent: editContent,
      redactedContent: redactContent(editContent),
      severity: editPiiResult.severity,
      status: "pending",
      createdAt: new Date(),
    }).catch(err => console.error("Compliance flag insert error:", err));
    res.status(400).json({
      error: "pii_blocked",
      message: "Pesan mengandung data sensitif (PII) dan tidak dapat dikirim ke channel publik.",
      piiTypes: editPiiResult.piiTypes,
      severity: editPiiResult.severity,
    });
    return;
  }

  if (editPiiResult.hasPII || editPiiResult.isRisky) {
    db.insert(complianceFlagsTable).values({
      messageId: msgId,
      conversationId: convId,
      userId: currentUser.id,
      flagType: editPiiResult.hasPII ? "pii_detected" : "risky_content",
      piiTypes: editPiiResult.hasPII ? editPiiResult.piiTypes : editPiiResult.riskyKeywords,
      originalContent: editContent,
      redactedContent: editPiiResult.hasPII ? redactContent(editContent) : editContent,
      severity: editPiiResult.severity,
      status: "pending",
      createdAt: new Date(),
    }).catch(err => console.error("Compliance flag insert error:", err));
  }

  const [updated] = await db.update(messagesTable)
    .set({ content: editContent, isEdited: true, editedAt: new Date() })
    .where(eq(messagesTable.id, msgId))
    .returning();

  await logAudit({ userId: currentUser.id, action: "edit_message", entityType: "message", entityId: msgId, req });

  const [enriched] = await enrichMessages([updated]);
  const memberIds = await getConversationMemberIds(convId);
  broadcastToConversation(convId, memberIds, { type: "update_message", conversationId: convId, data: enriched });

  res.json(enriched);
});

router.delete("/:conversationId/messages/:messageId", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const msgId = parseInt(req.params.messageId);
  const currentUser = (req as any).user;

  const [message] = await db.select().from(messagesTable).where(eq(messagesTable.id, msgId));
  if (!message) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  if (message.conversationId !== convId) {
    res.status(404).json({ error: "Message not found in this conversation" });
    return;
  }

  if (message.senderId !== currentUser.id) {
    res.status(403).json({ error: "Can only delete own messages" });
    return;
  }

  const [membership] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  if (!membership) { res.status(403).json({ error: "forbidden" }); return; }

  const [deleted] = await db.update(messagesTable)
    .set({ isDeleted: true, content: null })
    .where(eq(messagesTable.id, msgId))
    .returning();

  await logAudit({ userId: currentUser.id, action: "delete_message", entityType: "message", entityId: msgId, req });

  const [enriched] = await enrichMessages([deleted]);
  const memberIds = await getConversationMemberIds(convId);
  broadcastToConversation(convId, memberIds, { type: "update_message", conversationId: convId, data: enriched });

  res.json(enriched);
});

router.patch("/:conversationId/messages/:messageId/pin", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const msgId = parseInt(req.params.messageId);
  const currentUser = (req as any).user;

  const [message] = await db.select().from(messagesTable).where(eq(messagesTable.id, msgId));
  if (!message) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  const [membership] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  if (!membership) { res.status(403).json({ error: "forbidden" }); return; }

  const newPinState = !message.isPinned;
  const [updated] = await db.update(messagesTable)
    .set({ isPinned: newPinState })
    .where(eq(messagesTable.id, msgId))
    .returning();

  await logAudit({ userId: currentUser.id, action: newPinState ? "pin_message" : "unpin_message", entityType: "message", entityId: msgId, req });

  const [enriched] = await enrichMessages([updated]);
  const memberIds = await getConversationMemberIds(convId);
  broadcastToConversation(convId, memberIds, { type: "update_message", conversationId: convId, data: enriched });

  res.json(enriched);
});

// P3.2 — Mark single message as read
router.post("/:conversationId/messages/:messageId/read", requireAuth as any, async (req, res) => {
  const currentUser = (req as any).user;
  const convId = parseInt(req.params.conversationId);
  const msgId = parseInt(req.params.messageId);

  // Check membership
  const [membership] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  if (!membership) { res.status(403).json({ error: "forbidden" }); return; }

  // Check message exists in conversation
  const [message] = await db.select().from(messagesTable)
    .where(and(eq(messagesTable.id, msgId), eq(messagesTable.conversationId, convId)));
  if (!message) { res.status(404).json({ error: "message not found" }); return; }

  // Insert or ignore if already read
  try {
    await db.insert(messageReadsTable).values({
      messageId: msgId,
      userId: currentUser.id,
    }).onConflictDoNothing();
  } catch (e) {
    // Ignore unique constraint violations
  }

  await logAudit({
    userId: currentUser.id,
    action: "mark_message_read",
    resourceType: "message",
    resourceId: msgId,
    details: { conversationId: convId }
  });

  res.json({ success: true });
});

// P3.3 — Batch mark multiple messages as read
router.post("/:conversationId/mark-read", requireAuth as any, async (req, res) => {
  const currentUser = (req as any).user;
  const convId = parseInt(req.params.conversationId);

  // Check membership
  const [membership] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  if (!membership) { res.status(403).json({ error: "forbidden" }); return; }

  // Get all unread messages in conversation
  const unreadMessages = await db.select({ id: messagesTable.id }).from(messagesTable)
    .where(eq(messagesTable.conversationId, convId))
    .leftJoin(messageReadsTable, and(
      eq(messageReadsTable.messageId, messagesTable.id),
      eq(messageReadsTable.userId, currentUser.id)
    ))
    .where(sql`${messageReadsTable.id} IS NULL`);

  if (unreadMessages.length > 0) {
    const messageIds = unreadMessages.map(m => m.id);
    
    // Batch insert reads
    for (const msgId of messageIds) {
      try {
        await db.insert(messageReadsTable).values({
          messageId: msgId,
          userId: currentUser.id,
        }).onConflictDoNothing();
      } catch (e) {
        // Ignore errors
      }
    }

    await logAudit({
      userId: currentUser.id,
      action: "mark_conversation_read",
      resourceType: "conversation",
      resourceId: convId,
      details: { messageCount: messageIds.length }
    });
  }

  res.json({ success: true, markedCount: unreadMessages.length });
});

// ── Pin/Unpin message ───────────────────────────────────────────────────────
router.post("/:conversationId/messages/:messageId/pin", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const msgId = parseInt(req.params.messageId);
  const currentUser = (req as any).user;

  const [membership] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  if (!membership) { res.status(403).json({ error: "forbidden" }); return; }

  const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, msgId));
  if (!msg || msg.conversationId !== convId) { res.status(404).json({ error: "not found" }); return; }

  const newPinState = !msg.isPinned;
  await db.update(messagesTable).set({ isPinned: newPinState }).where(eq(messagesTable.id, msgId));

  await logAudit({
    userId: currentUser.id,
    action: newPinState ? "pin_message" : "unpin_message",
    entityType: "message",
    entityId: msgId,
    req
  });

  const [enriched] = await enrichMessages([{ ...msg, isPinned: newPinState }]);
  const memberIds = await getConversationMemberIds(convId);
  broadcastToConversation(convId, memberIds, { type: newPinState ? "message_pinned" : "message_unpinned", conversationId: convId, data: enriched });

  res.json({ success: true, isPinned: newPinState });
});

// ── Favorite/Unfavorite message ─────────────────────────────────────────────
router.post("/:conversationId/messages/:messageId/favorite", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const msgId = parseInt(req.params.messageId);
  const currentUser = (req as any).user;

  const [membership] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  if (!membership) { res.status(403).json({ error: "forbidden" }); return; }

  const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, msgId));
  if (!msg || msg.conversationId !== convId) { res.status(404).json({ error: "not found" }); return; }

  const [existing] = await db.select().from(messageFavoritesTable)
    .where(and(eq(messageFavoritesTable.messageId, msgId), eq(messageFavoritesTable.userId, currentUser.id)));

  if (existing) {
    await db.delete(messageFavoritesTable).where(and(
      eq(messageFavoritesTable.messageId, msgId),
      eq(messageFavoritesTable.userId, currentUser.id)
    ));
    await logAudit({
      userId: currentUser.id,
      action: "unfavorite_message",
      entityType: "message",
      entityId: msgId,
      req
    });
    res.json({ success: true, isFavorited: false });
  } else {
    await db.insert(messageFavoritesTable).values({
      messageId: msgId,
      userId: currentUser.id,
    });
    await logAudit({
      userId: currentUser.id,
      action: "favorite_message",
      entityType: "message",
      entityId: msgId,
      req
    });
    res.json({ success: true, isFavorited: true });
  }
});

// ── Get favorite messages ────────────────────────────────────────────────────
router.get("/:conversationId/favorites", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const currentUser = (req as any).user;
  const limit = Math.min(parseInt(req.query.limit as string || "50"), 100);

  const [membership] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  if (!membership) { res.status(403).json({ error: "forbidden" }); return; }

  const favorites = await db.select({ messageId: messageFavoritesTable.messageId })
    .from(messageFavoritesTable)
    .where(eq(messageFavoritesTable.userId, currentUser.id))
    .leftJoin(messagesTable, eq(messageFavoritesTable.messageId, messagesTable.id))
    .where(eq(messagesTable.conversationId, convId))
    .orderBy(desc(messageFavoritesTable.createdAt))
    .limit(limit);

  const msgIds = favorites.map(f => f.messageId).filter(Boolean);
  const messages = await db.select().from(messagesTable).where(inArray(messagesTable.id, msgIds));

  const enriched = await enrichMessages(messages);
  res.json({ messages: enriched, hasMore: false });
});

// ── Search messages ──────────────────────────────────────────────────────────
router.get("/:conversationId/search", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const currentUser = (req as any).user;
  const query = (req.query.q as string || "").trim();
  const senderId = req.query.senderId ? parseInt(req.query.senderId as string) : undefined;
  const beforeDate = req.query.before ? new Date(req.query.before as string) : undefined;
  const afterDate = req.query.after ? new Date(req.query.after as string) : undefined;
  const limit = Math.min(parseInt(req.query.limit as string || "50"), 100);

  if (!query) { res.status(400).json({ error: "query required" }); return; }

  const [membership] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  if (!membership) { res.status(403).json({ error: "forbidden" }); return; }

  const conditions: any[] = [
    eq(messagesTable.conversationId, convId),
    sql`${messagesTable.content} ILIKE ${`%${query}%`}`
  ];

  if (senderId) conditions.push(eq(messagesTable.senderId, senderId));
  if (beforeDate) conditions.push(sql`${messagesTable.createdAt} < ${beforeDate}`);
  if (afterDate) conditions.push(sql`${messagesTable.createdAt} > ${afterDate}`);

  const messages = await db.select().from(messagesTable)
    .where(and(...conditions))
    .orderBy(desc(messagesTable.createdAt))
    .limit(limit);

  const enriched = await enrichMessages(messages);
  res.json({ 
    messages: enriched,
    query,
    filters: { senderId, beforeDate, afterDate },
    resultCount: messages.length 
  });
});

// ── Fetch link metadata ──────────────────────────────────────────────────────
router.post("/link-preview", requireAuth as any, async (req, res) => {
  const { url } = req.body;
  if (!url) { res.status(400).json({ error: "url required" }); return; }

  try {
    const urlObj = new URL(url);
    const allowedDomains = ["http", "https"];
    if (!allowedDomains.includes(urlObj.protocol.replace(":", ""))) {
      res.status(400).json({ error: "invalid protocol" });
      return;
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CurCol/1.0)"
      },
      timeout: 5000
    });

    if (!response.ok) { res.status(400).json({ error: "fetch failed" }); return; }

    const html = await response.text();
    const { load } = await import("cheerio");
    const $ = load(html);

    const title = $("meta[property='og:title']").attr("content") || $("title").text() || url;
    const description = $("meta[property='og:description']").attr("content") || $("meta[name='description']").attr("content") || "";
    const image = $("meta[property='og:image']").attr("content") || "";
    const domain = urlObj.hostname || url;

    res.json({
      url,
      title: title.substring(0, 200),
      description: description.substring(0, 300),
      image,
      domain
    });
  } catch (error: any) {
    console.error("Link preview error:", error.message);
    res.status(500).json({ error: "failed to fetch preview" });
  }
});

export default router;
