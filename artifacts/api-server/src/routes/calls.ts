import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { broadcastToUser } from "../lib/websocket.js";

const router = Router();

interface GroupCallRoom {
  roomName: string;
  conversationId: number;
  callType: "voice" | "video";
  startedBy: number;
  startedByName: string;
  startedAt: string;
  participants: Array<{ userId: number; userName: string; joinedAt: string }>;
}

interface AdhocCallRoom {
  roomName: string;
  callType: "voice" | "video";
  startedBy: number;
  startedByName: string;
  startedAt: string;
  invitedUserIds: number[];
  participants: Array<{ userId: number; userName: string; joinedAt: string }>;
}

const activeGroupCalls = new Map<number, GroupCallRoom>();
const activeAdhocCalls = new Map<string, AdhocCallRoom>();

router.get("/", requireAuth as any, async (req, res) => {
  const currentUser = (req as any).user;
  
  const calls = await db.execute(sql`
    SELECT c.*, 
      caller.name as caller_name, caller.avatar_url as caller_avatar,
      receiver.name as receiver_name, receiver.avatar_url as receiver_avatar
    FROM calls c
    JOIN users caller ON c.caller_id = caller.id
    JOIN users receiver ON c.receiver_id = receiver.id
    WHERE c.caller_id = ${currentUser.id} OR c.receiver_id = ${currentUser.id}
    ORDER BY c.started_at DESC
    LIMIT 50
  `);
  
  res.json({ calls: calls.rows });
});

router.post("/:callId/end", requireAuth as any, async (req, res) => {
  const { callId } = req.params;
  const { reason } = req.body;
  
  await db.execute(sql`
    UPDATE calls 
    SET status = 'ended', ended_at = NOW(), end_reason = ${reason || 'hangup'},
        duration = EXTRACT(EPOCH FROM (NOW() - COALESCE(answered_at, started_at)))::integer
    WHERE id = ${Number(callId)}
  `);
  
  res.json({ success: true });
});

async function checkMembership(userId: number, conversationId: number): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM conversation_members WHERE user_id = ${userId} AND conversation_id = ${conversationId} LIMIT 1
  `);
  return (result.rows?.length ?? 0) > 0;
}

router.post("/group-call/:conversationId", requireAuth as any, async (req, res) => {
  const currentUser = (req as any).user;
  const conversationId = Number(req.params.conversationId);
  const { callType } = req.body;

  const isMember = await checkMembership(currentUser.id, conversationId);
  if (!isMember) {
    return res.status(403).json({ error: "Not a member of this conversation" });
  }

  const existing = activeGroupCalls.get(conversationId);
  if (existing) {
    return res.json({ room: existing, isNew: false });
  }

  const members = await db.execute(sql`
    SELECT cm.user_id, u.name 
    FROM conversation_members cm 
    JOIN users u ON cm.user_id = u.id 
    WHERE cm.conversation_id = ${conversationId}
  `);

  const timestamp = Date.now();
  const roomName = `corpchat-${conversationId}-${timestamp}`;

  const room: GroupCallRoom = {
    roomName,
    conversationId,
    callType: callType || "video",
    startedBy: currentUser.id,
    startedByName: currentUser.displayName || currentUser.name || "Unknown",
    startedAt: new Date().toISOString(),
    participants: [{
      userId: currentUser.id,
      userName: currentUser.displayName || currentUser.name || "Unknown",
      joinedAt: new Date().toISOString(),
    }],
  };

  activeGroupCalls.set(conversationId, room);

  for (const row of members.rows as any[]) {
    if (row.user_id !== currentUser.id) {
      broadcastToUser(row.user_id, {
        type: "group_call_started",
        conversationId,
        roomName,
        callType: room.callType,
        startedBy: currentUser.id,
        startedByName: room.startedByName,
      });
    }
  }

  res.json({ room, isNew: true });
});

router.get("/group-call/:conversationId", requireAuth as any, async (req, res) => {
  const currentUser = (req as any).user;
  const conversationId = Number(req.params.conversationId);

  const isMember = await checkMembership(currentUser.id, conversationId);
  if (!isMember) {
    return res.status(403).json({ error: "Not a member of this conversation" });
  }

  const room = activeGroupCalls.get(conversationId);

  if (!room) {
    return res.json({ room: null, active: false });
  }

  res.json({ room, active: true });
});

router.post("/group-call/:conversationId/join", requireAuth as any, async (req, res) => {
  const currentUser = (req as any).user;
  const conversationId = Number(req.params.conversationId);

  const isMember = await checkMembership(currentUser.id, conversationId);
  if (!isMember) {
    return res.status(403).json({ error: "Not a member of this conversation" });
  }

  const room = activeGroupCalls.get(conversationId);
  if (!room) {
    return res.status(404).json({ error: "No active group call" });
  }

  const alreadyJoined = room.participants.some(p => p.userId === currentUser.id);
  if (!alreadyJoined) {
    room.participants.push({
      userId: currentUser.id,
      userName: currentUser.displayName || currentUser.name || "Unknown",
      joinedAt: new Date().toISOString(),
    });
  }

  const members = await db.execute(sql`
    SELECT cm.user_id FROM conversation_members cm WHERE cm.conversation_id = ${conversationId}
  `);

  for (const row of members.rows as any[]) {
    if (row.user_id !== currentUser.id) {
      broadcastToUser(row.user_id, {
        type: "group_call_joined",
        conversationId,
        roomName: room.roomName,
        userId: currentUser.id,
        userName: currentUser.displayName || currentUser.name || "Unknown",
        participants: room.participants,
      });
    }
  }

  res.json({ room });
});

router.delete("/group-call/:conversationId", requireAuth as any, async (req, res) => {
  const currentUser = (req as any).user;
  const conversationId = Number(req.params.conversationId);

  const isMember = await checkMembership(currentUser.id, conversationId);
  if (!isMember) {
    return res.status(403).json({ error: "Not a member of this conversation" });
  }

  const room = activeGroupCalls.get(conversationId);
  if (!room) {
    return res.json({ success: true });
  }

  activeGroupCalls.delete(conversationId);

  const members = await db.execute(sql`
    SELECT cm.user_id FROM conversation_members cm WHERE cm.conversation_id = ${conversationId}
  `);

  for (const row of members.rows as any[]) {
    broadcastToUser(row.user_id, {
      type: "group_call_ended",
      conversationId,
      roomName: room.roomName,
      endedBy: currentUser.id,
    });
  }

  res.json({ success: true });
});

router.post("/group-call/:conversationId/leave", requireAuth as any, async (req, res) => {
  const currentUser = (req as any).user;
  const conversationId = Number(req.params.conversationId);

  const isMember = await checkMembership(currentUser.id, conversationId);
  if (!isMember) {
    return res.status(403).json({ error: "Not a member of this conversation" });
  }

  const room = activeGroupCalls.get(conversationId);
  if (!room) {
    return res.json({ success: true });
  }

  room.participants = room.participants.filter(p => p.userId !== currentUser.id);

  if (room.participants.length === 0) {
    activeGroupCalls.delete(conversationId);

    const members = await db.execute(sql`
      SELECT cm.user_id FROM conversation_members cm WHERE cm.conversation_id = ${conversationId}
    `);

    for (const row of members.rows as any[]) {
      broadcastToUser(row.user_id, {
        type: "group_call_ended",
        conversationId,
        roomName: room.roomName,
        endedBy: currentUser.id,
      });
    }
  } else {
    const members = await db.execute(sql`
      SELECT cm.user_id FROM conversation_members cm WHERE cm.conversation_id = ${conversationId}
    `);

    for (const row of members.rows as any[]) {
      if (row.user_id !== currentUser.id) {
        broadcastToUser(row.user_id, {
          type: "group_call_left",
          conversationId,
          roomName: room.roomName,
          userId: currentUser.id,
          participants: room.participants,
        });
      }
    }
  }

  res.json({ success: true });
});

router.post("/adhoc-call", requireAuth as any, async (req, res) => {
  const currentUser = (req as any).user;
  const { userIds, callType } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: "userIds array is required" });
  }

  const allUserIds = [currentUser.id, ...userIds.filter((uid: number) => uid !== currentUser.id)];

  const users = await db.execute(sql`
    SELECT id, name FROM users WHERE id = ANY(${allUserIds})
  `);
  const userMap = new Map((users.rows as any[]).map(u => [u.id, u.name]));

  const timestamp = Date.now();
  const roomName = `corpchat-adhoc-${currentUser.id}-${timestamp}`;

  const room: AdhocCallRoom = {
    roomName,
    callType: callType || "video",
    startedBy: currentUser.id,
    startedByName: currentUser.displayName || currentUser.name || "Unknown",
    startedAt: new Date().toISOString(),
    invitedUserIds: allUserIds,
    participants: [{
      userId: currentUser.id,
      userName: currentUser.displayName || currentUser.name || "Unknown",
      joinedAt: new Date().toISOString(),
    }],
  };

  activeAdhocCalls.set(roomName, room);

  for (const uid of userIds) {
    if (uid !== currentUser.id) {
      broadcastToUser(uid, {
        type: "adhoc_call_started",
        roomName,
        callType: room.callType,
        startedBy: currentUser.id,
        startedByName: room.startedByName,
        invitedUsers: allUserIds.map(id => ({ userId: id, userName: userMap.get(id) || "Unknown" })),
      });
    }
  }

  res.json({ room });
});

router.post("/adhoc-call/:roomName/join", requireAuth as any, async (req, res) => {
  const currentUser = (req as any).user;
  const { roomName } = req.params;

  const room = activeAdhocCalls.get(roomName);
  if (!room) {
    return res.status(404).json({ error: "No active ad-hoc call" });
  }

  if (!room.invitedUserIds.includes(currentUser.id)) {
    return res.status(403).json({ error: "Not invited to this call" });
  }

  const alreadyJoined = room.participants.some(p => p.userId === currentUser.id);
  if (!alreadyJoined) {
    room.participants.push({
      userId: currentUser.id,
      userName: currentUser.displayName || currentUser.name || "Unknown",
      joinedAt: new Date().toISOString(),
    });
  }

  for (const uid of room.invitedUserIds) {
    if (uid !== currentUser.id) {
      broadcastToUser(uid, {
        type: "adhoc_call_joined",
        roomName,
        userId: currentUser.id,
        userName: currentUser.displayName || currentUser.name || "Unknown",
        participants: room.participants,
      });
    }
  }

  res.json({ room });
});

router.post("/adhoc-call/:roomName/leave", requireAuth as any, async (req, res) => {
  const currentUser = (req as any).user;
  const { roomName } = req.params;

  const room = activeAdhocCalls.get(roomName);
  if (!room) {
    return res.json({ success: true });
  }

  if (!room.invitedUserIds.includes(currentUser.id)) {
    return res.status(403).json({ error: "Not authorized for this call" });
  }

  room.participants = room.participants.filter(p => p.userId !== currentUser.id);

  if (room.participants.length === 0) {
    activeAdhocCalls.delete(roomName);
    for (const uid of room.invitedUserIds) {
      broadcastToUser(uid, {
        type: "adhoc_call_ended",
        roomName,
        endedBy: currentUser.id,
      });
    }
  } else {
    for (const uid of room.invitedUserIds) {
      if (uid !== currentUser.id) {
        broadcastToUser(uid, {
          type: "adhoc_call_left",
          roomName,
          userId: currentUser.id,
          participants: room.participants,
        });
      }
    }
  }

  res.json({ success: true });
});

export default router;
