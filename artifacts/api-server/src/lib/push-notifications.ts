import { db } from "@workspace/db";
import { pushTokensTable } from "@workspace/db";
import { eq, inArray, and, ne } from "drizzle-orm";
import { getConnectedUserIds } from "./websocket.js";

interface ExpoPushMessage {
  to: string;
  title?: string;
  body: string;
  data?: Record<string, any>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
  priority?: "default" | "normal" | "high";
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: any;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

async function sendExpoPushNotifications(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
  if (messages.length === 0) return [];

  try {
    const chunks: ExpoPushMessage[][] = [];
    for (let i = 0; i < messages.length; i += 100) {
      chunks.push(messages.slice(i, i + 100));
    }

    const allTickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      });

      const result = await response.json();
      if (result.data) {
        allTickets.push(...result.data);

        for (let i = 0; i < result.data.length; i++) {
          const ticket = result.data[i];
          if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
            await db.delete(pushTokensTable).where(eq(pushTokensTable.token, chunk[i].to)).catch(() => {});
          }
        }
      }
    }

    return allTickets;
  } catch (error) {
    console.error("[Push] Failed to send push notifications:", error);
    return [];
  }
}

export async function registerPushToken(userId: number, token: string, platform: string = "expo") {
  await db.delete(pushTokensTable).where(
    and(eq(pushTokensTable.token, token), ne(pushTokensTable.userId, userId))
  ).catch(() => {});

  const existing = await db.select().from(pushTokensTable)
    .where(and(eq(pushTokensTable.userId, userId), eq(pushTokensTable.token, token)));

  if (existing.length > 0) {
    await db.update(pushTokensTable)
      .set({ updatedAt: new Date() })
      .where(and(eq(pushTokensTable.userId, userId), eq(pushTokensTable.token, token)));
  } else {
    await db.insert(pushTokensTable).values({ userId, token, platform });
  }
}

export async function unregisterPushToken(userId: number, token: string) {
  await db.delete(pushTokensTable)
    .where(and(eq(pushTokensTable.userId, userId), eq(pushTokensTable.token, token)));
}

export async function getTokensForUsers(userIds: number[]): Promise<Map<number, string[]>> {
  if (userIds.length === 0) return new Map();

  const tokens = await db.select().from(pushTokensTable)
    .where(inArray(pushTokensTable.userId, userIds));

  const tokenMap = new Map<number, string[]>();
  for (const t of tokens) {
    if (!tokenMap.has(t.userId)) tokenMap.set(t.userId, []);
    tokenMap.get(t.userId)!.push(t.token);
  }
  return tokenMap;
}

function isUserOnlineViaWs(userId: number): boolean {
  try {
    const connectedIds = getConnectedUserIds();
    return connectedIds.includes(userId);
  } catch {
    return false;
  }
}

export async function sendNewMessagePush(params: {
  senderId: number;
  senderName: string;
  conversationId: number;
  conversationName?: string;
  conversationType: string;
  content: string;
  memberUserIds: number[];
}) {
  const { senderId, senderName, conversationId, conversationName, conversationType, content, memberUserIds } = params;

  const recipientIds = memberUserIds.filter(uid => uid !== senderId && !isUserOnlineViaWs(uid));
  if (recipientIds.length === 0) return;

  const tokenMap = await getTokensForUsers(recipientIds);
  if (tokenMap.size === 0) return;

  const isGroup = conversationType === "group" || conversationType === "announcement";
  const title = isGroup ? (conversationName || "Group") : senderName;
  const body = isGroup ? `${senderName}: ${truncate(content, 100)}` : truncate(content, 100);

  const messages: ExpoPushMessage[] = [];
  for (const [, tokens] of tokenMap) {
    for (const token of tokens) {
      if (!token.startsWith("ExponentPushToken[")) continue;
      messages.push({
        to: token,
        title,
        body,
        sound: "default",
        priority: "high",
        channelId: "messages",
        data: { conversationId, type: "new_message" },
      });
    }
  }

  if (messages.length > 0) {
    console.log(`[Push] Sending ${messages.length} push notification(s) for conversation #${conversationId}`);
    sendExpoPushNotifications(messages).catch(err => {
      console.error("[Push] Background send failed:", err);
    });
  }
}

function truncate(str: string, maxLen: number): string {
  if (!str) return "";
  return str.length > maxLen ? str.substring(0, maxLen) + "…" : str;
}
