import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  token: text("token").notNull().unique(),
  refreshToken: text("refresh_token").unique(),
  expiresAt: timestamp("expires_at").notNull(),
  refreshExpiresAt: timestamp("refresh_expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Session = typeof sessionsTable.$inferSelect;
