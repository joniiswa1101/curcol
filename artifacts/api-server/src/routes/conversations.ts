import { Router } from "express";
import {
  db, conversationsTable, conversationMembersTable, messagesTable, usersTable, cicoStatusTable
} from "@workspace/db";
import { eq, and, inArray, sql, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { logAudit } from "../lib/audit.js";
import { sanitizeUser } from "../lib/sanitize.js";
import { broadcastToUser } from "../lib/websocket.js";

const router = Router();

async function getUsersForConversation(userIds: number[]) {
  if (userIds.length === 0) return [];
  const users = await db.select().from(usersTable).where(inArray(usersTable.id, userIds));
  const cicoStatuses = await db.select().from(cicoStatusTable);
  const cicoMap = new Map(cicoStatuses.map(c => [c.employeeId, c]));
  return users.map(u => ({ ...sanitizeUser(u), cicoStatus: cicoMap.get(u.employeeId) || null }));
}

async function isGroupAdmin(conversationId: number, userId: number): Promise<boolean> {
  const [member] = await db.select().from(conversationMembersTable)
    .where(and(
      eq(conversationMembersTable.conversationId, conversationId),
      eq(conversationMembersTable.userId, userId),
      eq(conversationMembersTable.role, "admin")
    ));
  return !!member;
}

async function isMemberOf(conversationId: number, userId: number) {
  const [member] = await db.select().from(conversationMembersTable)
    .where(and(
      eq(conversationMembersTable.conversationId, conversationId),
      eq(conversationMembersTable.userId, userId)
    ));
  return member || null;
}

async function getConversationMemberIds(conversationId: number): Promise<number[]> {
  const members = await db.select({ userId: conversationMembersTable.userId })
    .from(conversationMembersTable)
    .where(eq(conversationMembersTable.conversationId, conversationId));
  return members.map(m => m.userId);
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

  const lastMsgsRaw = await db
    .select({
      conversationId: messagesTable.conversationId,
      id: messagesTable.id,
      senderId: messagesTable.senderId,
      content: messagesTable.content,
      createdAt: messagesTable.createdAt,
      type: messagesTable.type,
      isEdited: messagesTable.isEdited,
    })
    .from(messagesTable)
    .where(inArray(messagesTable.conversationId, convIds))
    .orderBy(desc(messagesTable.createdAt))
    .then(msgs => {
      const map = new Map<number, typeof msgs[0]>();
      for (const msg of msgs) {
        if (!map.has(msg.conversationId)) {
          map.set(msg.conversationId, msg);
        }
      }
      return map;
    });
  const lastMsgMap = lastMsgsRaw;

  const membershipMap = new Map(memberships.map(m => [m.conversationId, m]));

  const result = convs.map(conv => {
    const myMembership = membershipMap.get(conv.id);
    const convMembers = allMembers.filter(m => m.conversationId === conv.id);
    const memberCount = convMembers.length;
    const rawLastMsg = lastMsgMap.get(conv.id);
    const clearedAt = myMembership?.clearedAt;
    const lastMsg = rawLastMsg && clearedAt && new Date(rawLastMsg.createdAt).getTime() <= new Date(clearedAt).getTime() ? null : rawLastMsg;

    const lastReadAt = myMembership?.lastReadAt;
    let unreadCount = 0;
    if (lastReadAt && lastMsg) {
      const msgTime = new Date(lastMsg.createdAt).getTime();
      const readTime = new Date(lastReadAt).getTime();
      unreadCount = msgTime > readTime ? 1 : 0;
    } else if (!lastReadAt && lastMsg) {
      unreadCount = 1;
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
      myRole: myMembership?.role || "member",
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
  const { type, memberIds, name, description, avatarUrl } = req.body;

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

  if (type === "group") {
    if (!name || !name.trim()) {
      res.status(400).json({ error: "bad_request", message: "Group name is required" });
      return;
    }
    if (!memberIds || memberIds.length === 0) {
      res.status(400).json({ error: "bad_request", message: "Group must have at least 1 other member" });
      return;
    }
  }

  const [conv] = await db.insert(conversationsTable).values({
    type,
    name: name || null,
    description: description || null,
    avatarUrl: avatarUrl || null,
    createdById: currentUser.id,
    updatedAt: new Date(),
  }).returning();

  const allMembers = [currentUser.id, ...memberIds.filter((id: number) => id !== currentUser.id)];
  await db.insert(conversationMembersTable).values(
    allMembers.map((uid: number) => ({
      conversationId: conv.id,
      userId: uid,
      role: uid === currentUser.id && type === "group" ? "admin" as const : "member" as const,
      joinedAt: new Date(),
    }))
  );

  if (type === "group") {
    const systemMsg = await db.insert(messagesTable).values({
      conversationId: conv.id,
      senderId: currentUser.id,
      content: `${currentUser.name} membuat grup "${name}"`,
      type: "system",
      createdAt: new Date(),
    }).returning();

    for (const uid of allMembers) {
      if (uid !== currentUser.id) {
        broadcastToUser(uid, {
          type: "group_created",
          conversationId: conv.id,
          groupName: name,
          createdBy: currentUser.name,
        });
      }
    }
  }

  await logAudit({ userId: currentUser.id, action: "create_conversation", entityType: "conversation", entityId: conv.id, req });

  const membersData = await db.select().from(conversationMembersTable)
    .where(eq(conversationMembersTable.conversationId, conv.id));
  const userIds = membersData.map(m => m.userId);
  const users = await getUsersForConversation(userIds);
  const userMap = new Map(users.map(u => [u.id, u]));

  res.status(201).json({
    ...conv,
    members: membersData.map(m => ({ ...m, user: userMap.get(m.userId) || null })),
    memberCount: allMembers.length,
    unreadCount: 0,
    isPinned: false,
    isMuted: false,
    myRole: type === "group" ? "admin" : "member",
  });
});

router.get("/:conversationId", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const currentUser = (req as any).user;

  const [member] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  if (!member) { res.status(403).json({ error: "forbidden" }); return; }

  const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, convId));
  if (!conv) { res.status(404).json({ error: "not_found" }); return; }

  const allMembers = await db.select().from(conversationMembersTable)
    .where(eq(conversationMembersTable.conversationId, convId));
  const userIds = allMembers.map(m => m.userId);
  const users = await getUsersForConversation(userIds);
  const userMap = new Map(users.map(u => [u.id, u]));

  res.json({
    ...conv,
    memberCount: allMembers.length,
    unreadCount: 0,
    isPinned: member.isPinned,
    isMuted: member.isMuted,
    myRole: member.role,
    members: allMembers.map(m => ({ ...m, user: userMap.get(m.userId) || null })),
  });
});

router.patch("/:conversationId", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const currentUser = (req as any).user;
  const { name, description, avatarUrl } = req.body;

  const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, convId));
  if (!conv) { res.status(404).json({ error: "not_found" }); return; }

  if (conv.type === "group") {
    const admin = await isGroupAdmin(convId, currentUser.id);
    if (!admin) {
      res.status(403).json({ error: "forbidden", message: "Only group admins can update group info" });
      return;
    }
  }

  const updateData: any = { updatedAt: new Date() };
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;

  const [updated] = await db.update(conversationsTable).set(updateData)
    .where(eq(conversationsTable.id, convId)).returning();

  if (conv.type === "group" && name && name !== conv.name) {
    await db.insert(messagesTable).values({
      conversationId: convId,
      senderId: currentUser.id,
      content: `${currentUser.name} mengubah nama grup menjadi "${name}"`,
      type: "system",
      createdAt: new Date(),
    });
  }

  const allMembers = await db.select().from(conversationMembersTable)
    .where(eq(conversationMembersTable.conversationId, convId));
  const userIds = allMembers.map(m => m.userId);
  const users = await getUsersForConversation(userIds);
  const userMap = new Map(users.map(u => [u.id, u]));
  const myMembership = allMembers.find(m => m.userId === currentUser.id);

  await logAudit({ userId: currentUser.id, action: "update_conversation", entityType: "conversation", entityId: convId, req });

  for (const uid of userIds) {
    broadcastToUser(uid, { type: "conversation_updated", conversationId: convId });
  }

  res.json({
    ...updated,
    members: allMembers.map(m => ({ ...m, user: userMap.get(m.userId) || null })),
    memberCount: allMembers.length,
    unreadCount: 0,
    isPinned: myMembership?.isPinned || false,
    isMuted: myMembership?.isMuted || false,
    myRole: myMembership?.role || "member",
  });
});

router.get("/:conversationId/members", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const currentUser = (req as any).user;

  const myMembership = await isMemberOf(convId, currentUser.id);
  if (!myMembership) { res.status(403).json({ error: "forbidden" }); return; }

  const members = await db.select().from(conversationMembersTable).where(eq(conversationMembersTable.conversationId, convId));
  const userIds = members.map(m => m.userId);
  const users = await getUsersForConversation(userIds);
  const userMap = new Map(users.map(u => [u.id, u]));
  res.json({ members: members.map(m => ({ ...m, user: userMap.get(m.userId) || null })) });
});

router.post("/:conversationId/members", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const currentUser = (req as any).user;
  const { userId, userIds: bulkUserIds } = req.body;

  const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, convId));
  if (!conv) { res.status(404).json({ error: "not_found" }); return; }

  const callerMember = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  if (callerMember.length === 0) {
    res.status(403).json({ error: "forbidden", message: "You are not a member of this conversation" });
    return;
  }

  if (conv.type === "group") {
    const admin = await isGroupAdmin(convId, currentUser.id);
    if (!admin) {
      res.status(403).json({ error: "forbidden", message: "Only group admins can add members" });
      return;
    }
  }

  const idsToAdd = bulkUserIds || (userId ? [userId] : []);
  if (idsToAdd.length === 0) {
    res.status(400).json({ error: "bad_request", message: "No user IDs provided" });
    return;
  }

  const existingMembers = await db.select().from(conversationMembersTable)
    .where(eq(conversationMembersTable.conversationId, convId));
  const existingIds = new Set(existingMembers.map(m => m.userId));
  const newIds = idsToAdd.filter((id: number) => !existingIds.has(id));

  if (newIds.length === 0) {
    res.json({ success: true, message: "All users are already members", added: 0 });
    return;
  }

  await db.insert(conversationMembersTable).values(
    newIds.map((uid: number) => ({
      conversationId: convId,
      userId: uid,
      role: "member" as const,
      joinedAt: new Date(),
    }))
  );

  const addedUsers = await getUsersForConversation(newIds);
  const addedNames = addedUsers.map(u => u.name).join(", ");

  await db.insert(messagesTable).values({
    conversationId: convId,
    senderId: currentUser.id,
    content: `${currentUser.name} menambahkan ${addedNames} ke grup`,
    type: "system",
    createdAt: new Date(),
  });

  await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, convId));

  const allMemberIds = await getConversationMemberIds(convId);
  for (const uid of allMemberIds) {
    broadcastToUser(uid, { type: "members_changed", conversationId: convId });
  }

  await logAudit({ userId: currentUser.id, action: "add_group_members", entityType: "conversation", entityId: convId, details: { addedUserIds: newIds }, req });

  res.json({ success: true, message: `${newIds.length} member(s) added`, added: newIds.length });
});

router.delete("/:conversationId/members/:userId", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const targetUserId = parseInt(req.params.userId);
  const currentUser = (req as any).user;

  const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, convId));
  if (!conv) { res.status(404).json({ error: "not_found" }); return; }

  const callerMember = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  if (callerMember.length === 0) {
    res.status(403).json({ error: "forbidden", message: "You are not a member of this conversation" });
    return;
  }

  if (conv.type === "group") {
    const isAdmin = await isGroupAdmin(convId, currentUser.id);
    if (!isAdmin) {
      res.status(403).json({ error: "forbidden", message: "Only group admins can remove members" });
      return;
    }

    if (targetUserId === conv.createdById) {
      res.status(400).json({ error: "bad_request", message: "Cannot remove the group creator" });
      return;
    }
  }

  const removedUsers = await getUsersForConversation([targetUserId]);
  const removedName = removedUsers[0]?.name || "Unknown";

  await db.delete(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, targetUserId)));

  await db.insert(messagesTable).values({
    conversationId: convId,
    senderId: currentUser.id,
    content: `${currentUser.name} mengeluarkan ${removedName} dari grup`,
    type: "system",
    createdAt: new Date(),
  });

  const allMemberIds = await getConversationMemberIds(convId);
  for (const uid of [...allMemberIds, targetUserId]) {
    broadcastToUser(uid, { type: "members_changed", conversationId: convId, removedUserId: targetUserId });
  }

  await logAudit({ userId: currentUser.id, action: "remove_group_member", entityType: "conversation", entityId: convId, details: { removedUserId: targetUserId }, req });

  res.json({ success: true, message: "Member removed" });
});

router.post("/:conversationId/members/:userId/promote", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const targetUserId = parseInt(req.params.userId);
  const currentUser = (req as any).user;

  const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, convId));
  if (!conv || conv.type !== "group") { res.status(404).json({ error: "not_found" }); return; }

  const isAdmin = await isGroupAdmin(convId, currentUser.id);
  if (!isAdmin) {
    res.status(403).json({ error: "forbidden", message: "Only group admins can promote members" });
    return;
  }

  const targetMember = await isMemberOf(convId, targetUserId);
  if (!targetMember) {
    res.status(404).json({ error: "not_found", message: "User is not a member of this group" });
    return;
  }

  if (targetMember.role === "admin") {
    res.json({ success: true, message: "User is already an admin" });
    return;
  }

  await db.update(conversationMembersTable).set({ role: "admin" })
    .where(and(
      eq(conversationMembersTable.conversationId, convId),
      eq(conversationMembersTable.userId, targetUserId)
    ));

  const promotedUsers = await getUsersForConversation([targetUserId]);
  const promotedName = promotedUsers[0]?.name || "Unknown";

  await db.insert(messagesTable).values({
    conversationId: convId,
    senderId: currentUser.id,
    content: `${currentUser.name} menjadikan ${promotedName} sebagai admin grup`,
    type: "system",
    createdAt: new Date(),
  });

  const allMemberIds = await getConversationMemberIds(convId);
  for (const uid of allMemberIds) {
    broadcastToUser(uid, { type: "members_changed", conversationId: convId });
  }

  await logAudit({ userId: currentUser.id, action: "promote_group_admin", entityType: "conversation", entityId: convId, details: { promotedUserId: targetUserId }, req });

  res.json({ success: true, message: `${promotedName} is now an admin` });
});

router.post("/:conversationId/members/:userId/demote", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const targetUserId = parseInt(req.params.userId);
  const currentUser = (req as any).user;

  const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, convId));
  if (!conv || conv.type !== "group") { res.status(404).json({ error: "not_found" }); return; }

  if (targetUserId === conv.createdById) {
    res.status(400).json({ error: "bad_request", message: "Cannot demote the group creator" });
    return;
  }

  const isAdmin = await isGroupAdmin(convId, currentUser.id);
  if (!isAdmin) {
    res.status(403).json({ error: "forbidden", message: "Only group admins can demote members" });
    return;
  }

  await db.update(conversationMembersTable).set({ role: "member" })
    .where(and(
      eq(conversationMembersTable.conversationId, convId),
      eq(conversationMembersTable.userId, targetUserId)
    ));

  const demotedUsers = await getUsersForConversation([targetUserId]);
  const demotedName = demotedUsers[0]?.name || "Unknown";

  await db.insert(messagesTable).values({
    conversationId: convId,
    senderId: currentUser.id,
    content: `${currentUser.name} mencabut hak admin ${demotedName}`,
    type: "system",
    createdAt: new Date(),
  });

  const allMemberIds = await getConversationMemberIds(convId);
  for (const uid of allMemberIds) {
    broadcastToUser(uid, { type: "members_changed", conversationId: convId });
  }

  await logAudit({ userId: currentUser.id, action: "demote_group_admin", entityType: "conversation", entityId: convId, details: { demotedUserId: targetUserId }, req });

  res.json({ success: true, message: `${demotedName} is no longer an admin` });
});

router.post("/:conversationId/leave", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const currentUser = (req as any).user;

  const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, convId));
  if (!conv || conv.type !== "group") { res.status(404).json({ error: "not_found" }); return; }

  const member = await isMemberOf(convId, currentUser.id);
  if (!member) { res.status(403).json({ error: "forbidden" }); return; }

  if (currentUser.id === conv.createdById) {
    res.status(400).json({ error: "bad_request", message: "Group creator cannot leave. Transfer ownership or delete the group instead." });
    return;
  }

  await db.delete(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));

  await db.insert(messagesTable).values({
    conversationId: convId,
    senderId: currentUser.id,
    content: `${currentUser.name} keluar dari grup`,
    type: "system",
    createdAt: new Date(),
  });

  const allMemberIds = await getConversationMemberIds(convId);
  for (const uid of [...allMemberIds, currentUser.id]) {
    broadcastToUser(uid, { type: "members_changed", conversationId: convId, removedUserId: currentUser.id });
  }

  await logAudit({ userId: currentUser.id, action: "leave_group", entityType: "conversation", entityId: convId, req });

  res.json({ success: true, message: "Left the group" });
});

router.delete("/:conversationId", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const currentUser = (req as any).user;

  const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, convId));
  if (!conv || conv.type !== "group") { res.status(404).json({ error: "not_found" }); return; }

  const isAdmin = await isGroupAdmin(convId, currentUser.id);
  if (!isAdmin) {
    res.status(403).json({ error: "forbidden", message: "Only group admins can delete the group" });
    return;
  }

  const allMemberIds = await getConversationMemberIds(convId);

  await db.delete(messagesTable).where(eq(messagesTable.conversationId, convId));
  await db.delete(conversationMembersTable).where(eq(conversationMembersTable.conversationId, convId));
  await db.delete(conversationsTable).where(eq(conversationsTable.id, convId));

  for (const uid of allMemberIds) {
    broadcastToUser(uid, { type: "group_deleted", conversationId: convId, groupName: conv.name });
  }

  await logAudit({ userId: currentUser.id, action: "delete_group", entityType: "conversation", entityId: convId, req });

  res.json({ success: true, message: "Group deleted" });
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

router.post("/:conversationId/mute", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const currentUser = (req as any).user;
  const [member] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  if (!member) { res.status(403).json({ error: "forbidden" }); return; }
  await db.update(conversationMembersTable).set({ isMuted: !member.isMuted })
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  res.json({ success: true, muted: !member.isMuted, message: `Notifications ${member.isMuted ? "unmuted" : "muted"}` });
});

router.post("/:conversationId/clear", requireAuth as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const currentUser = (req as any).user;
  const [member] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  if (!member) { res.status(403).json({ error: "forbidden" }); return; }
  await db.update(conversationMembersTable).set({ clearedAt: new Date() })
    .where(and(eq(conversationMembersTable.conversationId, convId), eq(conversationMembersTable.userId, currentUser.id)));
  await logAudit({ userId: currentUser.id, action: "clear_chat", entityType: "conversation", entityId: convId, req });
  res.json({ success: true, message: "Chat cleared" });
});

export default router;
