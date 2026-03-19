import { Router } from "express";
import {
  db, conversationsTable, conversationMembersTable, messagesTable, usersTable, cicoStatusTable
} from "@workspace/db";
import { eq, and, inArray, sql, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

async function getUsersForConversation(userIds: number[]) {
  if (userIds.length === 0) return [];
  const users = await db.select().from(usersTable).where(inArray(usersTable.id, userIds));
  const cicoStatuses = await db.select().from(cicoStatusTable);
  const cicoMap = new Map(cicoStatuses.map(c => [c.employeeId, c]));
  return users.map(u => ({ ...u, password: undefined, cicoStatus: cicoMap.get(u.employeeId) || null }));
}

router.get("/", requireAuth as any, async (req, res) => {
  const currentUser = (req as any).user;

  const memberships = await db.select().from(conversationMembersTable)
    .where(eq(conversationMembersTable.userId, currentUser.id));

  if (memberships.length === 0) { res.json({ conversations: [] }); return; }

  const convIds = memberships.map(m => m.conversationId);
  const convs = await db.select().from(conversationsTable).where(inArray(conversationsTable.id, convIds));

  const allMembers = await db.select().from(conversationMembersTable).where(inArray(conversationMembersTable.conversationId, convIds));
  const allUserIds = [...new Set(allMembers.map(m => m.userId))];
  const allUsers = await getUsersForConversation(allUserIds);
  const userMap = new Map(allUsers.map(u => [u.id, u]));

  const lastMessages = await Promise.all(convIds.map(async (cid) => {
    const [msg] = await db.select().from(messagesTable)
      .where(eq(messagesTable.conversationId, cid))
      .orderBy(desc(messagesTable.createdAt))
      .limit(1);
    return { cid, msg };
  }));
  const lastMsgMap = new Map(lastMessages.map(({ cid, msg }) => [cid, msg]));

  const membershipMap = new Map(memberships.map(m => [m.conversationId, m]));

  const result = convs.map(conv => {
    const myMembership = membershipMap.get(conv.id);
    const convMembers = allMembers.filter(m => m.conversationId === conv.id);
    const memberCount = convMembers.length;
    const lastMsg = lastMsgMap.get(conv.id);

    const lastReadAt = myMembership?.lastReadAt;
    // Calculate unread count: messages created after lastReadAt
    let unreadCount = 0;
    if (lastReadAt && lastMsg) {
      const msgTime = new Date(lastMsg.createdAt).getTime();
      const readTime = new Date(lastReadAt).getTime();
      unreadCount = msgTime > readTime ? 1 : 0;
    } else if (!lastReadAt && lastMsg) {
      unreadCount = 1; // No lastReadAt means all messages are unread
    }

    return {
      ...conv,
      members: convMembers.map(m => ({
        ...m,
        user: userMap.get(m.userId) || null,
      })),
      lastMessage: lastMsg ? {
        ...lastMsg,
        sender: userMap.get(lastMsg.senderId) || null,
      } : null,
      memberCount,
      unreadCount,
      lastReadAt,
      isPinned: myMembership?.isPinned || false,
      isMuted: myMembership?.isMuted || false,
    };
  });

  result.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    const aTime = a.lastMessage?.createdAt || a.createdAt;
    const bTime = b.lastMessage?.createdAt || b.createdAt;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

  res.json({ conversations: result });
});

router.post("/", requireAuth as any, async (req, res) => {
  const currentUser = (req as any).user;
  const { type, memberIds, name, description } = req.body;

  if (type === "direct" && memberIds.length !== 1) {
    res.status(400).json({ error: "bad_request", message: "Direct chat requires exactly 1 other user" });
    return;
  }

  if (type === "direct") {
    const otherId = memberIds[0];
    const existing = await db
      .select({ convId: conversationMembersTable.conversationId })
      .from(conversationMembersTable)
      .where(eq(conversationMembersTable.userId, currentUser.id));
    const myConvIds = existing.map(e => e.convId);

    if (myConvIds.length > 0) {
      const otherMemberships = await db
        .select()
        .from(conversationMembersTable)
        .where(and(
          eq(conversationMembersTable.userId, otherId),
          inArray(conversationMembersTable.conversationId, myConvIds)
        ));
      for (const om of otherMemberships) {
        const [conv] = await db.select().from(conversationsTable)
          .where(and(eq(conversationsTable.id, om.conversationId), eq(conversationsTable.type, "direct")));
        if (conv) {
          res.json(conv);
          return;
        }
      }
    }
  }

  const [conv] = await db.insert(conversationsTable).values({
    type,
    name: name || null,
    description: description || null,
    createdById: currentUser.id,
    updatedAt: new Date(),
  }).returning();

  const allMembers = [currentUser.id, ...memberIds.filter((id: number) => id !== currentUser.id)];
  await db.insert(conversationMembersTable).values(
    allMembers.map((uid: number) => ({
      conversationId: conv.id,
      userId: uid,
      role: uid === currentUser.id && type === "group" ? "admin" : "member",
      joinedAt: new Date(),
    }))
  );

  await logAudit({ userId: currentUser.id, action: "create_conversation", entityType: "conversation", entityId: conv.id, req });
  res.status(201).json({ ...conv, memberCount: allMembers.length, unreadCount: 0, isPinned: false, isMuted: false });
});

router.get("/:conversationId", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const currentUser = (req as any).user;
  const [member] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  if (!member) { res.status(403).json({ error: "forbidden" }); return; }
  const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, convId));
  if (!conv) { res.status(404).json({ error: "not_found" }); return; }
  res.json({ ...conv, memberCount: 0, unreadCount: 0, isPinned: member.isPinned, isMuted: member.isMuted });
});

router.patch("/:conversationId", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const { name, description, avatarUrl } = req.body;
  const [updated] = await db.update(conversationsTable).set({ name, description, avatarUrl, updatedAt: new Date() })
    .where(eq(conversationsTable.id, convId)).returning();
  res.json({ ...updated, memberCount: 0, unreadCount: 0, isPinned: false, isMuted: false });
});

router.get("/:conversationId/members", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const members = await db.select().from(conversationMembersTable).where(eq(conversationMembersTable.conversationId, convId));
  const userIds = members.map(m => m.userId);
  const users = await getUsersForConversation(userIds);
  const userMap = new Map(users.map(u => [u.id, u]));
  res.json({ members: members.map(m => ({ ...m, user: userMap.get(m.userId) || null })) });
});

router.post("/:conversationId/members", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const { userId } = req.body;
  await db.insert(conversationMembersTable).values({ conversationId: convId, userId, role: "member", joinedAt: new Date() });
  res.json({ success: true, message: "Member added" });
});

router.delete("/:conversationId/members/:userId", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const userId = parseInt(req.params.userId);
  await db.delete(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, userId)));
  res.json({ success: true, message: "Member removed" });
});

router.post("/:conversationId/pin", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const currentUser = (req as any).user;
  const [member] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  if (!member) { res.status(403).json({ error: "forbidden" }); return; }
  await db.update(conversationMembersTable).set({ isPinned: !member.isPinned })
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  res.json({ success: true, message: `Conversation ${member.isPinned ? "unpinned" : "pinned"}` });
});

export default router;
