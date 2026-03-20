import { pgTable, varchar, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const offlineQueueTable = pgTable("offline_queue", {
  id: varchar("id").primaryKey().$default(() => crypto.randomUUID?.() || Date.now().toString()),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  conversationId: integer("conversation_id").notNull(),
  content: text("content"),
  type: text("type").notNull().default("text"),
  attachmentIds: jsonb("attachment_ids"),
  replyToId: integer("reply_to_id"),
  status: text("status").notNull().default("pending"),
  retryCount: integer("retry_count").notNull().default(0),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  syncedAt: timestamp("synced_at"),
});

export type OfflineQueueEntry = typeof offlineQueueTable.$inferSelect;
