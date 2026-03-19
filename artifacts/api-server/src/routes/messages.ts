import { Router } from "express";
import {
  db, messagesTable, conversationMembersTable, conversationsTable,
  attachmentsTable, messageReactionsTable, usersTable, cicoStatusTable
} from "@workspace/db";
import { eq, and, lt, desc, ilike, inArray, sql } from "drizzle-orm";
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

async function enrichMessage(msg: any) {
  const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, msg.senderId));
  const [cicoStatus] = sender
    ? await db.select().from(cicoStatusTable).where(eq(cicoStatusTable.employeeId, sender.employeeId))
    : [null];
  const attachments = await db.select().from(attachmentsTable).where(eq(attachmentsTable.messageId, msg.id));
  const reactions = await db.select().from(messageReactionsTable).where(eq(messageReactionsTable.messageId, msg.id));
  const reactionMap: Record<string, { emoji: string; count: number; userIds: number[] }> = {};
  for (const r of reactions) {
    if (!reactionMap[r.emoji]) reactionMap[r.emoji] = { emoji: r.emoji, count: 0, userIds: [] };
    reactionMap[r.emoji].count++;
    reactionMap[r.emoji].userIds.push(r.userId);
  }
  return {
    ...msg,
    sender: sender ? { ...sender, password: undefined, cicoStatus: cicoStatus || null } : null,
    attachments,
    reactions: Object.values(reactionMap),
  };
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
  const enriched = await Promise.all(slice.map(enrichMessage));

  // Update last read
  await db.update(conversationMembersTable).set({ lastReadAt: new Date() })
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));

  res.json({ messages: enriched.reverse(), hasMore });
});

router.post("/:conversationId/messages", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const currentUser = (req as any).user;
  const { content, type = "text", replyToId, attachmentIds } = req.body;

  const [membership] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  if (!membership) { res.status(403).json({ error: "forbidden" }); return; }

  const [conversation] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, convId));

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

  await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, convId));

  if (conversation?.type === "whatsapp" && conversation.whatsappContactPhone && content) {
    // Reply to external WhatsApp contact
    const senderName = currentUser.name || "Tim CurCol";
    const whatsappMessage = `*${senderName}:*\n${content}`;
    await sendWhatsAppMessage(conversation.whatsappContactPhone, whatsappMessage);
    console.log(`📤 Reply forwarded to WhatsApp contact ${conversation.whatsappContactPhone}`);
  } else if (conversation?.type === "direct" && content) {
    // DM notification: notify the OTHER member via WhatsApp if they have a number
    try {
      const members = await db.select({ userId: conversationMembersTable.userId })
        .from(conversationMembersTable)
        .where(eq(conversationMembersTable.conversationId, convId));
      const recipientId = members.find(m => m.userId !== currentUser.id)?.userId;
      if (recipientId) {
        const [recipient] = await db.select().from(usersTable).where(eq(usersTable.id, recipientId));
        if (recipient?.whatsappNumber) {
          const preview = content.length > 100 ? content.substring(0, 100) + "..." : content;
          const waMsg = `💬 *Pesan baru dari ${currentUser.name}*\n\n${preview}\n\n_Balas di CurCol_`;
          await sendWhatsAppMessage(recipient.whatsappNumber, waMsg);
          console.log(`📲 DM notification sent to ${recipient.name} via WhatsApp`);
        }
      }
    } catch (notifErr) {
      console.warn("⚠️ Failed to send WhatsApp DM notification:", notifErr);
    }
  }

  await logAudit({ userId: currentUser.id, action: "send_message", entityType: "message", entityId: msg.id, req });

  const enriched = await enrichMessage(msg);
  const memberIds = await getConversationMemberIds(convId);
  broadcastToConversation(convId, memberIds, { type: "new_message", data: enriched });

  res.status(201).json(enriched);
});

router.get("/:conversationId/pinned", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const pinned = await db.select().from(messagesTable)
    .where(and(eq(messagesTable.conversationId, convId), eq(messagesTable.isPinned, true)));
  const enriched = await Promise.all(pinned.map(enrichMessage));
  res.json({ messages: enriched, hasMore: false });
});

// Typing indicator: broadcast to all members in conversation
router.post("/:conversationId/typing", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const currentUser = (req as any).user;

  // Verify user is member of conversation
  const [membership] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  if (!membership) { res.status(403).json({ error: "forbidden" }); return; }

  // Broadcast typing indicator to all members
  const memberIds = await getConversationMemberIds(convId);
  broadcastToConversation(convId, memberIds, {
    type: "typing_indicator",
    data: { userId: currentUser.id, userName: currentUser.name, isTyping: true }
  });

  res.json({ success: true });
});

// Stop typing indicator
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

export default router;
