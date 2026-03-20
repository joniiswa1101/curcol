import { pgTable, serial, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const stickersTable = pgTable("stickers", {
  id: serial("id").primaryKey(),
  packId: varchar("pack_id", { length: 50 }).notNull(),
  packName: varchar("pack_name", { length: 255 }).notNull(),
  stickerUrl: text("sticker_url").notNull(),
  alt: varchar("alt", { length: 255}),
  order: serial("order").notNull(),
  createdAt: timestamp("created_at", { precision: 3 }).defaultNow(),
});

export type Sticker = typeof stickersTable.$inferSelect;
