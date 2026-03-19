import { pgTable, serial, integer, timestamp, text, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const loginAttemptsTable = pgTable("login_attempts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  ipAddress: text("ip_address").notNull(),
  success: boolean("success").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type LoginAttempt = typeof loginAttemptsTable.$inferSelect;
