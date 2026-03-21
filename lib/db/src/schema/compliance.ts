import { pgTable, serial, integer, text, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { messagesTable } from "./messages";
import { conversationsTable } from "./conversations";

export const complianceFlagTypeEnum = pgEnum("compliance_flag_type", [
  "pii_detected",
  "risky_content",
  "blocked",
]);

export const complianceSeverityEnum = pgEnum("compliance_severity", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const complianceStatusEnum = pgEnum("compliance_status", [
  "pending",
  "reviewed",
  "dismissed",
  "escalated",
]);

export const complianceFlagsTable = pgTable("compliance_flags", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").references(() => messagesTable.id),
  conversationId: integer("conversation_id").references(() => conversationsTable.id),
  userId: integer("user_id").references(() => usersTable.id),
  flagType: text("flag_type").notNull().default("pii_detected"),
  piiTypes: jsonb("pii_types"),
  originalContent: text("original_content"),
  redactedContent: text("redacted_content"),
  severity: text("severity").notNull().default("medium"),
  status: text("status").notNull().default("pending"),
  reviewedById: integer("reviewed_by_id").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ComplianceFlag = typeof complianceFlagsTable.$inferSelect;
