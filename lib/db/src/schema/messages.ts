import { pgTable, serial, text, integer, boolean, timestamp, jsonb, pgEnum, index } from "drizzle-orm/pg-core";
import { conversationsTable } from "./conversations";
import { usersTable } from "./users";

export const messageTypeEnum = pgEnum("message_type", ["text", "image", "file", "system"]);

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversationsTable.id),
  senderId: integer("sender_id").notNull().references(() => usersTable.id),
  content: text("content"),
  type: messageTypeEnum("type").notNull().default("text"),
  replyToId: integer("reply_to_id"),
  isPinned: boolean("is_pinned").notNull().default(false),
  isEdited: boolean("is_edited").notNull().default(false),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
  editedAt: timestamp("edited_at"),
  originalContent: text("original_content"),
  waMessageId: text("wa_message_id"),
  isFromWhatsapp: boolean("is_from_whatsapp").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  conversationIdIdx: index("idx_messages_conversation_id").on(table.conversationId),
  senderIdIdx: index("idx_messages_sender_id").on(table.senderId),
  createdAtIdx: index("idx_messages_created_at").on(table.createdAt),
  conversationCreatedIdx: index("idx_messages_conversation_created").on(table.conversationId, table.createdAt),
}));

export const attachmentsTable = pgTable("attachments", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").references(() => messagesTable.id),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  url: text("url").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const messageReactionsTable = pgTable("message_reactions", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => messagesTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  emoji: text("emoji").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Message = typeof messagesTable.$inferSelect;
export type Attachment = typeof attachmentsTable.$inferSelect;
export type MessageReaction = typeof messageReactionsTable.$inferSelect;
