import { Router } from "express";
import { db, announcementsTable, usersTable } from "@workspace/db";
import { eq, desc, sql, inArray } from "drizzle-orm";
import { requireAuth, requireAdminOrManager } from "../lib/auth.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

router.get("/", requireAuth as any, async (req, res) => {
  const page = parseInt(req.query.page as string || "1");
  const limit = parseInt(req.query.limit as string || "20");
  const offset = (page - 1) * limit;

  const [announcements, countResult] = await Promise.all([
    db.select().from(announcementsTable).orderBy(desc(announcementsTable.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(announcementsTable),
  ]);

  const authorIds = [...new Set(announcements.map(a => a.authorId))];
  const authors = authorIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, authorIds))
    : [];
  const authorMap = new Map(authors.map(u => [u.id, { ...u, password: undefined }]));

  res.json({
    announcements: announcements.map(a => ({ ...a, author: authorMap.get(a.authorId) || null })),
    total: Number(countResult[0].count),
    page,
    limit,
  });
});

router.post("/", requireAdminOrManager as any, async (req, res) => {
  const currentUser = (req as any).user;
  const { title, content, isPinned = false } = req.body;

  const [announcement] = await db.insert(announcementsTable).values({
    title,
    content,
    authorId: currentUser.id,
    isPinned,
    updatedAt: new Date(),
  }).returning();

  await logAudit({ userId: currentUser.id, action: "create_announcement", entityType: "announcement", entityId: announcement.id, req });
  res.status(201).json({ ...announcement, author: { ...currentUser, password: undefined } });
});

export default router;
