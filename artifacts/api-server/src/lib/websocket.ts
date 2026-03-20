import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { getUserFromToken } from "./auth.js";

interface AuthenticatedClient extends WebSocket {
  userId?: number;
  employeeId?: string;
  isAlive?: boolean;
  typingTimeouts?: Map<number, NodeJS.Timeout>;
}

let wss: WebSocketServer | null = null;
const clients = new Set<AuthenticatedClient>();
const typingUsers = new Map<number, Set<number>>();

export function initWebSocket(server: Server) {
  wss = new WebSocketServer({ server, path: "/ws" });

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
    }

    ws.isAlive = true;
    clients.add(ws);

    ws.on("pong", () => { ws.isAlive = true; });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
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
      
      typingUsers.forEach((users) => {
        if (ws.userId) users.delete(ws.userId);
      });
      
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

export function broadcastToUser(userId: number, data: object) {
  const msg = JSON.stringify(data);
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN && ws.userId === userId) {
      ws.send(msg);
    }
  });
}
