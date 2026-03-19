import { pgTable, serial, text, integer, boolean, timestamp, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const conversationTypeEnum = pgEnum("conversation_type", ["direct", "group", "announcement", "whatsapp"]);
export const memberRoleEnum = pgEnum("member_role", ["admin", "member"]);
export const waStatusEnum = pgEnum("wa_status", ["unassigned", "assigned", "resolved"]);

export const conversationsTable = pgTable("conversations", {
  id: serial("id").primaryKey(),
  type: conversationTypeEnum("type").notNull(),
  name: text("name"),
  description: text("description"),
  avatarUrl: text("avatar_url"),
  createdById: integer("created_by_id").references(() => usersTable.id),
  whatsappContactPhone: text("whatsapp_contact_phone"),
  whatsappContactName: text("whatsapp_contact_name"),
  waStatus: waStatusEnum("wa_status").default("unassigned"),
  assignedToId: integer("assigned_to_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  createdAtIdx: index("idx_conversations_created_at").on(table.createdAt),
  updatedAtIdx: index("idx_conversations_updated_at").on(table.updatedAt),
  waStatusIdx: index("idx_conversations_wa_status").on(table.waStatus),
}));

export const conversationMembersTable = pgTable("conversation_members", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversationsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  role: memberRoleEnum("role").notNull().default("member"),
  isPinned: boolean("is_pinned").notNull().default(false),
  isMuted: boolean("is_muted").notNull().default(false),
  lastReadAt: timestamp("last_read_at"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
}, (table) => ({
  conversationUserIdx: uniqueIndex("idx_conversation_members_conversation_user").on(table.conversationId, table.userId),
  conversationIdIdx: index("idx_conversation_members_conversation_id").on(table.conversationId),
  userIdIdx: index("idx_conversation_members_user_id").on(table.userId),
}));

export type Conversation = typeof conversationsTable.$inferSelect;
export type ConversationMember = typeof conversationMembersTable.$inferSelect;
