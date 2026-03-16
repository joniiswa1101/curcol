import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { getUserFromToken } from "./auth.js";

interface AuthenticatedClient extends WebSocket {
  userId?: number;
  employeeId?: string;
  isAlive?: boolean;
}

let wss: WebSocketServer | null = null;
const clients = new Set<AuthenticatedClient>();

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
      }
    }

    ws.isAlive = true;
    clients.add(ws);

    ws.on("pong", () => { ws.isAlive = true; });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
      } catch {}
    });

    ws.on("close", () => { clients.delete(ws); });
    ws.on("error", () => { clients.delete(ws); });

    ws.send(JSON.stringify({ type: "connected", userId: ws.userId }));
  });

  const interval = setInterval(() => {
    clients.forEach((ws) => {
      if (!ws.isAlive) { ws.terminate(); clients.delete(ws); return; }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

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
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN && ws.userId && userIds.includes(ws.userId)) {
      ws.send(msg);
    }
  });
}

export function broadcastToUser(userId: number, data: object) {
  const msg = JSON.stringify(data);
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN && ws.userId === userId) {
      ws.send(msg);
    }
  });
}
