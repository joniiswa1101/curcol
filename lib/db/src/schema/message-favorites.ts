import { pgTable, serial, integer, timestamp, index, unique } from "drizzle-orm/pg-core";
import { messagesTable } from "./messages";
import { usersTable } from "./users";

export const messageFavoritesTable = pgTable("message_favorites", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => messagesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  messageUserIdx: unique("idx_message_favorites_user_unique").on(table.messageId, table.userId),
  userIdIdx: index("idx_message_favorites_user_id").on(table.userId),
  messageIdIdx: index("idx_message_favorites_message_id").on(table.messageId),
}));

export type MessageFavorite = typeof messageFavoritesTable.$inferSelect;
