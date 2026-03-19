import { Router } from "express";
import { db, messagesTable, conversationMembersTable, usersTable } from "@workspace/db";
import { eq, and, ilike, inArray, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { sanitizeUser } from "../lib/sanitize.js";

const router = Router();

router.get("/", requireAuth as any, async (req, res) => {
  const q = req.query.q as string;
  const convId = req.query.conversationId ? parseInt(req.query.conversationId as string) : undefined;
  const page = parseInt(req.query.page as string || "1");
  const limit = Math.min(parseInt(req.query.limit as string || "20"), 50);
  const offset = (page - 1) * limit;
  const currentUser = (req as any).user;

  if (!q || q.trim().length < 2) {
    res.json({ messages: [], hasMore: false });
    return;
  }

  const myMemberships = await db.select({ conversationId: conversationMembersTable.conversationId })
    .from(conversationMembersTable)
    .where(eq(conversationMembersTable.userId, currentUser.id));
  const myConvIds = myMemberships.map(m => m.conversationId);

  if (myConvIds.length === 0) { res.json({ messages: [], hasMore: false }); return; }

  const conditions: any[] = [
    ilike(messagesTable.content, `%${q}%`),
    inArray(messagesTable.conversationId, myConvIds),
    eq(messagesTable.isDeleted, false),
  ];
  if (convId) conditions.push(eq(messagesTable.conversationId, convId));

  const messages = await db.select().from(messagesTable)
    .where(and(...conditions))
    .orderBy(desc(messagesTable.createdAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = messages.length > limit;
  const slice = messages.slice(0, limit);

  const senderIds = [...new Set(slice.map(m => m.senderId))];
  const senders = senderIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, senderIds))
    : [];
  const senderMap = new Map(senders.map(u => [u.id, sanitizeUser(u)]));

  res.json({
    messages: slice.map(m => ({ ...m, sender: senderMap.get(m.senderId) || null, attachments: [], reactions: [] })),
    hasMore,
  });
});

export default router;
