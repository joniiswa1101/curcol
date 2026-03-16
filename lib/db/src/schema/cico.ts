import { pgTable, serial, text, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const cicoStatusEnum = pgEnum("cico_presence_status", ["present", "break", "wfh", "absent", "off"]);
export const cicoTypeEnum = pgEnum("cico_check_type", ["office", "wfh"]);

export const cicoStatusTable = pgTable("cico_status", {
  id: serial("id").primaryKey(),
  employeeId: text("employee_id").notNull().unique(),
  status: cicoStatusEnum("status").notNull().default("absent"),
  checkInTime: timestamp("check_in_time"),
  checkOutTime: timestamp("check_out_time"),
  location: text("location"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const cicoLogsTable = pgTable("cico_logs", {
  id: serial("id").primaryKey(),
  employeeId: text("employee_id").notNull(),
  action: text("action").notNull(),
  location: text("location"),
  type: cicoTypeEnum("type"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CicoStatus = typeof cicoStatusTable.$inferSelect;
export type CicoLog = typeof cicoLogsTable.$inferSelect;
