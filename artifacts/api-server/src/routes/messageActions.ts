import { Router } from "express";
import { db, messagesTable, messageReactionsTable, conversationMembersTable } from "@workspace/db";
import { eq, and, ilike, inArray, sql, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { logAudit } from "../lib/audit.js";
import { broadcastToConversation } from "../lib/websocket.js";

const router = Router();

async function getConversationMemberIds(conversationId: number): Promise<number[]> {
  const members = await db.select({ userId: conversationMembersTable.userId })
    .from(conversationMembersTable)
    .where(eq(conversationMembersTable.conversationId, conversationId));
  return members.map(m => m.userId);
}

router.patch("/:messageId", requireAuth as any, async (req, res) => {
  const messageId = parseInt(req.params.messageId);
  const currentUser = (req as any).user;
  const { content } = req.body;

  const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, messageId));
  if (!msg) { res.status(404).json({ error: "not_found" }); return; }
  if (msg.senderId !== currentUser.id) { res.status(403).json({ error: "forbidden" }); return; }

  const [updated] = await db.update(messagesTable).set({
    content,
    isEdited: true,
    editedAt: new Date(),
    originalContent: msg.content,
  }).where(eq(messagesTable.id, messageId)).returning();

  await logAudit({ userId: currentUser.id, action: "edit_message", entityType: "message", entityId: messageId,
    details: { original: msg.content, new: content }, req });

  const memberIds = await getConversationMemberIds(msg.conversationId);
  broadcastToConversation(msg.conversationId, memberIds, { type: "message_edited", data: updated });

  res.json({ ...updated, sender: null, attachments: [], reactions: [] });
});

router.delete("/:messageId", requireAuth as any, async (req, res) => {
  const messageId = parseInt(req.params.messageId);
  const currentUser = (req as any).user;

  const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, messageId));
  if (!msg) { res.status(404).json({ error: "not_found" }); return; }
  if (msg.senderId !== currentUser.id && currentUser.role !== "admin") {
    res.status(403).json({ error: "forbidden" }); return;
  }

  await db.update(messagesTable).set({ isDeleted: true, deletedAt: new Date() })
    .where(eq(messagesTable.id, messageId));

  await logAudit({ userId: currentUser.id, action: "delete_message", entityType: "message", entityId: messageId,
    details: { content: msg.content }, req });

  const memberIds = await getConversationMemberIds(msg.conversationId);
  broadcastToConversation(msg.conversationId, memberIds, { type: "message_deleted", data: { messageId } });

  res.json({ success: true, message: "Message deleted" });
});

router.post("/:messageId/reactions", requireAuth as any, async (req, res) => {
  const messageId = parseInt(req.params.messageId);
  const currentUser = (req as any).user;
  const { emoji } = req.body;

  const existing = await db.select().from(messageReactionsTable)
    .where(and(eq(messageReactionsTable.messageId, messageId), eq(messageReactionsTable.userId, currentUser.id), eq(messageReactionsTable.emoji, emoji)));

  if (existing.length === 0) {
    await db.insert(messageReactionsTable).values({ messageId, userId: currentUser.id, emoji, createdAt: new Date() });
  }
  res.json({ success: true, message: "Reaction added" });
});

router.delete("/:messageId/reactions", requireAuth as any, async (req, res) => {
  const messageId = parseInt(req.params.messageId);
  const currentUser = (req as any).user;
  const { emoji } = req.body;

  await db.delete(messageReactionsTable)
    .where(and(eq(messageReactionsTable.messageId, messageId), eq(messageReactionsTable.userId, currentUser.id), eq(messageReactionsTable.emoji, emoji)));

  res.json({ success: true, message: "Reaction removed" });
});

router.post("/:messageId/pin", requireAuth as any, async (req, res) => {
  const messageId = parseInt(req.params.messageId);
  await db.update(messagesTable).set({ isPinned: true }).where(eq(messagesTable.id, messageId));
  await logAudit({ userId: (req as any).user.id, action: "pin_message", entityType: "message", entityId: messageId, req });
  res.json({ success: true, message: "Message pinned" });
});

router.delete("/:messageId/pin", requireAuth as any, async (req, res) => {
  const messageId = parseInt(req.params.messageId);
  await db.update(messagesTable).set({ isPinned: false }).where(eq(messagesTable.id, messageId));
  res.json({ success: true, message: "Message unpinned" });
});

export default router;
