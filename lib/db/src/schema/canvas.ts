import { pgTable, serial, text, integer, real, timestamp, pgEnum, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { conversationsTable } from "./conversations";

export const canvasElementTypeEnum = pgEnum("canvas_element_type", [
  "freehand", "rectangle", "ellipse", "line", "arrow", "text", "sticky_note", "image"
]);

export const canvasBoardsTable = pgTable("canvas_boards", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  conversationId: integer("conversation_id").references(() => conversationsTable.id),
  createdById: integer("created_by_id").notNull().references(() => usersTable.id),
  thumbnail: text("thumbnail"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  conversationIdx: index("idx_canvas_boards_conversation").on(table.conversationId),
  createdByIdx: index("idx_canvas_boards_created_by").on(table.createdById),
}));

export const canvasElementsTable = pgTable("canvas_elements", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").notNull().references(() => canvasBoardsTable.id, { onDelete: "cascade" }),
  elementType: canvasElementTypeEnum("element_type").notNull(),
  x: real("x").notNull().default(0),
  y: real("y").notNull().default(0),
  width: real("width").default(0),
  height: real("height").default(0),
  rotation: real("rotation").default(0),
  points: jsonb("points"),
  content: text("content"),
  style: jsonb("style").notNull().default({}),
  zIndex: integer("z_index").notNull().default(0),
  createdById: integer("created_by_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  boardIdx: index("idx_canvas_elements_board").on(table.boardId),
}));
