import { pgTable, serial, text, integer, boolean, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { conversationsTable } from "./conversations";

export const taskStatusEnum = pgEnum("task_status", ["todo", "in_progress", "review", "done", "cancelled"]);
export const taskPriorityEnum = pgEnum("task_priority", ["low", "medium", "high", "urgent"]);

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: taskStatusEnum("status").notNull().default("todo"),
  priority: taskPriorityEnum("priority").notNull().default("medium"),
  creatorId: integer("creator_id").notNull().references(() => usersTable.id),
  assigneeId: integer("assignee_id").references(() => usersTable.id),
  conversationId: integer("conversation_id").references(() => conversationsTable.id),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  statusIdx: index("idx_tasks_status").on(table.status),
  assigneeIdx: index("idx_tasks_assignee_id").on(table.assigneeId),
  creatorIdx: index("idx_tasks_creator_id").on(table.creatorId),
  dueDateIdx: index("idx_tasks_due_date").on(table.dueDate),
  conversationIdx: index("idx_tasks_conversation_id").on(table.conversationId),
}));

export const taskCommentsTable = pgTable("task_comments", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  taskIdx: index("idx_task_comments_task_id").on(table.taskId),
}));

export const taskLabelsTable = pgTable("task_labels", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
}, (table) => ({
  taskIdx: index("idx_task_labels_task_id").on(table.taskId),
}));

export type Task = typeof tasksTable.$inferSelect;
export type TaskComment = typeof taskCommentsTable.$inferSelect;
export type TaskLabel = typeof taskLabelsTable.$inferSelect;
