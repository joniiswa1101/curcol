import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const presenceStatusEnum = pgEnum("presence_status", ["online", "idle", "offline"]);

export const userPresenceTable = pgTable("user_presence", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => usersTable.id),
  status: presenceStatusEnum("status").notNull().default("offline"),
  lastSeenAt: timestamp("last_seen_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type UserPresence = typeof userPresenceTable.$inferSelect;
export type InsertUserPresence = typeof userPresenceTable.$inferInsert;
