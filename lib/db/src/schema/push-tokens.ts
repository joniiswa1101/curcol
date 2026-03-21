import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const pushTokensTable = pgTable("push_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  platform: text("platform").notNull().default("expo"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  userTokenIdx: uniqueIndex("idx_push_tokens_user_token").on(table.userId, table.token),
  tokenIdx: uniqueIndex("idx_push_tokens_token").on(table.token),
}));
