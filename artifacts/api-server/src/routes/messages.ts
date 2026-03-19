import { Router } from "express";
import {
  db, messagesTable, conversationMembersTable, conversationsTable,
  attachmentsTable, messageReactionsTable, usersTable, cicoStatusTable
} from "@workspace/db";
import { eq, and, lt, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { logAudit } from "../lib/audit.js";
import { broadcastToConversation } from "../lib/websocket.js";
import { sendWhatsAppMessage } from "../lib/whatsapp.js";

const router = Router();

async function getConversationMemberIds(conversationId: number): Promise<number[]> {
  const members = await db.select({ userId: conversationMembersTable.userId })
    .from(conversationMembersTable)
    .where(eq(conversationMembersTable.conversationId, conversationId));
  return members.map(m => m.userId);
}

// BATCHED enrichment - 4 queries total regardless of message count (was N*4 before)
async function enrichMessages(msgs: any[]) {
  if (msgs.length === 0) return [];

  const senderIds = [...new Set(msgs.map(m => m.senderId).filter((id): id is number => id != null))];
  const msgIds = msgs.map(m => m.id).filter((id): id is number => id != null);

  const [senders, attachments, reactions] = await Promise.all([
    senderIds.length > 0
      ? db.select().from(usersTable).where(inArray(usersTable.id, senderIds))
      : Promise.resolve([]),
    db.select().from(attachmentsTable).where(inArray(attachmentsTable.messageId as any, msgIds)),
    db.select().from(messageReactionsTable).where(inArray(messageReactionsTable.messageId as any, msgIds)),
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

  return msgs.map(msg => {
    const sender = senderMap.get(msg.senderId);
    const cicoStatus = sender ? cicoMap.get(sender.employeeId) || null : null;
    const msgAttachments = attachmentsByMsg.get(msg.id) || [];
    const msgReactions = reactionsByMsg.get(msg.id) || [];

    const reactionMap: Record<string, { emoji: string; count: number; userIds: number[] }> = {};
    for (const r of msgReactions) {
      if (!reactionMap[r.emoji]) reactionMap[r.emoji] = { emoji: r.emoji, count: 0, userIds: [] };
      reactionMap[r.emoji].count++;
      reactionMap[r.emoji].userIds.push(r.userId);
    }

    return {
      ...msg,
      sender: sender ? { ...sender, password: undefined, cicoStatus } : null,
      attachments: msgAttachments,
      reactions: Object.values(reactionMap),
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

  const [msg] = await db.insert(messagesTable).values({
    conversationId: convId,
    senderId: currentUser.id,
    content: content || null,
    type,
    replyToId: replyToId || null,
    createdAt: new Date(),
  }).returning();

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

  if (message.senderId !== currentUser.id) {
    res.status(403).json({ error: "Can only edit own messages" });
    return;
  }

  const [membership] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  if (!membership) { res.status(403).json({ error: "forbidden" }); return; }

  const [updated] = await db.update(messagesTable)
    .set({ content: content.trim(), isEdited: true, editedAt: new Date() })
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

export default router;
