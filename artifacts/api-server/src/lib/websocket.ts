import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { getUserFromToken } from "./auth.js";
import { db, canvasBoardsTable, canvasBoardMembersTable, conversationMembersTable } from "@workspace/db";
import { sql, eq, and } from "drizzle-orm";

interface AuthenticatedClient extends WebSocket {
  userId?: number;
  employeeId?: string;
  isAlive?: boolean;
  typingTimeouts?: Map<number, NodeJS.Timeout>;
  canvasBoards?: Set<number>;
}

let wss: WebSocketServer | null = null;
const clients = new Set<AuthenticatedClient>();
const typingUsers = new Map<number, Set<number>>();
const onlineUsers = new Map<number, string>();

async function updatePresence(userId: number, status: "online" | "idle" | "offline") {
  try {
    await db.execute(sql`
      INSERT INTO user_presence (user_id, status, last_seen_at, updated_at) 
      VALUES (${userId}, ${status}, NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE SET 
        status = ${status}, 
        last_seen_at = NOW(), 
        updated_at = NOW()
    `);
  } catch (e) {
    console.error("[Presence] DB update failed:", e);
  }
}

function getOnlineUserIds(): number[] {
  return Array.from(onlineUsers.keys());
}

function broadcastPresence(userId: number, status: string) {
  broadcastToAll({
    type: "presence_update",
    userId,
    status,
    timestamp: new Date().toISOString(),
  });
}

export { getOnlineUserIds };

export function getConnectedUserIds(): number[] {
  const ids = new Set<number>();
  clients.forEach(ws => {
    if (ws.userId && ws.readyState === WebSocket.OPEN) ids.add(ws.userId);
  });
  return Array.from(ids);
}

export function initWebSocket(server: Server) {
  wss = new WebSocketServer({ server, path: "/api/ws" });

  wss.on("connection", async (ws: AuthenticatedClient, req) => {
    const url = new URL(req.url || "", "ws://localhost");
    const token = url.searchParams.get("token");

    if (token) {
      const user = await getUserFromToken(token);
      if (user) {
        ws.userId = user.id;
        ws.employeeId = user.employeeId;
        console.log(`[WebSocket] 🔌 Client connected: userId=${ws.userId} (${ws.employeeId}), total=${clients.size + 1}`);
      } else {
        console.log(`[WebSocket] ❌ Invalid token`);
      }
    } else {
      console.log(`[WebSocket] ❌ No token provided`);
      ws.close(4001, "Authentication required");
      return;
    }

    if (!ws.userId) {
      ws.close(4001, "Authentication failed");
      return;
    }

    ws.isAlive = true;
    clients.add(ws);

    if (ws.userId) {
      onlineUsers.set(ws.userId, "online");
      updatePresence(ws.userId, "online");
      broadcastPresence(ws.userId, "online");
    }

    ws.on("pong", () => { ws.isAlive = true; });

    ws.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        } else if (msg.type === "call_offer" && ws.userId && msg.targetUserId) {
          console.log(`[Call] 📞 call_offer from userId=${ws.userId} to targetUserId=${msg.targetUserId}`);
          const sent = broadcastToUser(msg.targetUserId, {
            type: "call_offer",
            callerId: ws.userId,
            callerName: msg.callerName,
            callerAvatar: msg.callerAvatar,
            conversationId: msg.conversationId,
            callType: msg.callType,
            sdp: msg.sdp,
          });
          console.log(`[Call] 📞 call_offer relayed to ${sent} connection(s) of userId=${msg.targetUserId}`);
          if (sent === 0) {
            console.log(`[Call] ⚠️ Target userId=${msg.targetUserId} is offline, notifying caller`);
            ws.send(JSON.stringify({
              type: "call_failed",
              reason: "user_offline",
              targetUserId: msg.targetUserId,
            }));
          }
        } else if (msg.type === "call_answer" && ws.userId && msg.targetUserId) {
          console.log(`[Call] 📞 call_answer from userId=${ws.userId} to targetUserId=${msg.targetUserId}`);
          broadcastToUser(msg.targetUserId, {
            type: "call_answer",
            answererId: ws.userId,
            sdp: msg.sdp,
          });
        } else if (msg.type === "call_ice_candidate" && ws.userId && msg.targetUserId) {
          broadcastToUser(msg.targetUserId, {
            type: "call_ice_candidate",
            fromUserId: ws.userId,
            candidate: msg.candidate,
          });
        } else if (msg.type === "call_reject" && ws.userId && msg.targetUserId) {
          console.log(`[Call] 📞 call_reject from userId=${ws.userId} to targetUserId=${msg.targetUserId}`);
          broadcastToUser(msg.targetUserId, {
            type: "call_reject",
            fromUserId: ws.userId,
          });
        } else if (msg.type === "call_end" && ws.userId && msg.targetUserId) {
          console.log(`[Call] 📞 call_end from userId=${ws.userId} to targetUserId=${msg.targetUserId}`);
          broadcastToUser(msg.targetUserId, {
            type: "call_end",
            fromUserId: ws.userId,
          });
        } else if (msg.type === "presence" && ws.userId && msg.status) {
          const newStatus = msg.status === "idle" ? "idle" : "online";
          const currentStatus = onlineUsers.get(ws.userId);
          if (currentStatus !== newStatus) {
            onlineUsers.set(ws.userId, newStatus);
            updatePresence(ws.userId, newStatus);
            broadcastPresence(ws.userId, newStatus);
          }
        } else if (msg.type === "canvas_join" && ws.userId && msg.boardId) {
          const [boardCheck] = await db.select({ id: canvasBoardsTable.id, isPublic: canvasBoardsTable.isPublic, createdById: canvasBoardsTable.createdById, conversationId: canvasBoardsTable.conversationId }).from(canvasBoardsTable).where(eq(canvasBoardsTable.id, msg.boardId));
          if (boardCheck && !boardCheck.isPublic && boardCheck.createdById !== ws.userId) {
            const [memberCheck] = await db.select({ id: canvasBoardMembersTable.id }).from(canvasBoardMembersTable).where(and(eq(canvasBoardMembersTable.boardId, msg.boardId), eq(canvasBoardMembersTable.userId, ws.userId)));
            if (!memberCheck) {
              let convAccess = false;
              if (boardCheck.conversationId) {
                const [convCheck] = await db.select({ id: conversationMembersTable.id }).from(conversationMembersTable).where(and(eq(conversationMembersTable.conversationId, boardCheck.conversationId), eq(conversationMembersTable.userId, ws.userId)));
                convAccess = !!convCheck;
              }
              if (!convAccess) {
                ws.send(JSON.stringify({ type: "canvas_error", error: "Access denied to this board" }));
                return;
              }
            }
          }
          if (!ws.canvasBoards) ws.canvasBoards = new Set();
          ws.canvasBoards.add(msg.boardId);
          broadcastToBoard(msg.boardId, {
            type: "canvas_user_joined",
            userId: ws.userId,
            boardId: msg.boardId,
          }, ws.userId);
        } else if (msg.type === "canvas_leave" && ws.userId && msg.boardId) {
          ws.canvasBoards?.delete(msg.boardId);
          broadcastToBoard(msg.boardId, {
            type: "canvas_user_left",
            userId: ws.userId,
            boardId: msg.boardId,
          }, ws.userId);
        } else if (msg.type === "canvas_draw" && ws.userId && msg.boardId) {
          if (!ws.canvasBoards?.has(msg.boardId)) return;
          broadcastToBoard(msg.boardId, {
            type: "canvas_draw",
            userId: ws.userId,
            boardId: msg.boardId,
            element: msg.element,
            action: msg.action,
          }, ws.userId);
        } else if (msg.type === "canvas_cursor" && ws.userId && msg.boardId) {
          if (!ws.canvasBoards?.has(msg.boardId)) return;
          broadcastToBoard(msg.boardId, {
            type: "canvas_cursor",
            userId: ws.userId,
            userName: msg.userName,
            x: msg.x,
            y: msg.y,
            boardId: msg.boardId,
          }, ws.userId);
        } else if (msg.type === "canvas_clear" && ws.userId && msg.boardId) {
          if (!ws.canvasBoards?.has(msg.boardId)) return;
          broadcastToBoard(msg.boardId, {
            type: "canvas_clear",
            userId: ws.userId,
            boardId: msg.boardId,
          }, ws.userId);
        } else if (msg.type === "typing" && ws.userId && msg.conversationId) {
          const conversationId = msg.conversationId;
          
          if (!typingUsers.has(conversationId)) {
            typingUsers.set(conversationId, new Set());
          }
          
          if (!typingUsers.get(conversationId)!.has(ws.userId)) {
            typingUsers.get(conversationId)!.add(ws.userId);
            
            const typingList = Array.from(typingUsers.get(conversationId) || []);
            broadcastToConversation(conversationId, msg.userIds || [], {
              type: "typing",
              conversationId,
              typingUsers: typingList
            });
          }
          
          if (!ws.typingTimeouts) ws.typingTimeouts = new Map();
          
          const existingTimeout = ws.typingTimeouts.get(conversationId);
          if (existingTimeout) clearTimeout(existingTimeout);
          
          ws.typingTimeouts.set(
            conversationId,
            setTimeout(() => {
              typingUsers.get(conversationId)?.delete(ws.userId!);
              if (typingUsers.get(conversationId)?.size === 0) {
                typingUsers.delete(conversationId);
              }
              const remaining = Array.from(typingUsers.get(conversationId) || []);
              broadcastToConversation(conversationId, msg.userIds || [], {
                type: "typing",
                conversationId,
                typingUsers: remaining
              });
              ws.typingTimeouts?.delete(conversationId);
            }, 3000)
          );
        }
      } catch {}
    });

    ws.on("close", () => { 
      clients.delete(ws);
      
      if (ws.typingTimeouts) {
        ws.typingTimeouts.forEach(timeout => clearTimeout(timeout));
        ws.typingTimeouts.clear();
      }
      
      if (ws.canvasBoards && ws.userId) {
        ws.canvasBoards.forEach(boardId => {
          broadcastToBoard(boardId, {
            type: "canvas_user_left",
            userId: ws.userId,
            boardId,
          }, ws.userId);
        });
        ws.canvasBoards.clear();
      }
      
      typingUsers.forEach((users) => {
        if (ws.userId) users.delete(ws.userId);
      });
      
      if (ws.userId) {
        const stillConnected = Array.from(clients).some(c => c.userId === ws.userId && c !== ws);
        if (!stillConnected) {
          onlineUsers.delete(ws.userId);
          updatePresence(ws.userId, "offline");
          broadcastPresence(ws.userId, "offline");
        }
      }
      
      console.log(`[WebSocket] 🔌 Client disconnected: userId=${ws.userId}, remaining=${clients.size}`);
    });
    ws.on("error", (err) => { 
      console.error(`[WebSocket] Error:`, err);
      clients.delete(ws); 
    });

    ws.send(JSON.stringify({ type: "connected", userId: ws.userId }));
  });

  // Heartbeat interval: 60 seconds (extended for mobile battery optimization)
  // Clients should ping within 50s to maintain connection
  const interval = setInterval(() => {
    clients.forEach((ws) => {
      if (!ws.isAlive) { ws.terminate(); clients.delete(ws); return; }
      ws.isAlive = false;
      ws.ping();
    });
  }, 60000);

  wss.on("close", () => clearInterval(interval));

  return wss;
}

function broadcastToBoard(boardId: number, data: object, excludeUserId?: number) {
  const msg = JSON.stringify(data);
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN && ws.canvasBoards?.has(boardId) && ws.userId !== excludeUserId) {
      ws.send(msg);
    }
  });
}

export function broadcastToAll(data: object) {
  const msg = JSON.stringify(data);
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

export function broadcastToConversation(conversationId: number, userIds: number[], data: object) {
  const msg = JSON.stringify(data);
  let sent = 0;
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN && ws.userId && userIds.includes(ws.userId)) {
      ws.send(msg);
      sent++;
    }
  });
  console.log(`[WebSocket] Broadcast to conversation #${conversationId}: sent to ${sent}/${userIds.length} users`);
}

export function broadcastToUser(userId: number, data: object): number {
  const msg = JSON.stringify(data);
  let sent = 0;
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN && ws.userId === userId) {
      ws.send(msg);
      sent++;
    }
  });
  return sent;
}

export function sendToOneConnection(userId: number, data: object): boolean {
  const msg = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN && ws.userId === userId) {
      ws.send(msg);
      return true;
    }
  }
  return false;
}
