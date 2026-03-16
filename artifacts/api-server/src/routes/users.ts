import { Router } from "express";
import { db, usersTable, cicoStatusTable } from "@workspace/db";
import { eq, ilike, and, or, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

router.get("/", requireAuth as any, async (req, res) => {
  const { search, department, status, page = "1", limit = "20" } = req.query as any;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  const conditions: any[] = [];
  if (search) {
    conditions.push(or(
      ilike(usersTable.name, `%${search}%`),
      ilike(usersTable.email, `%${search}%`),
      ilike(usersTable.department, `%${search}%`)
    ));
  }
  if (department) conditions.push(eq(usersTable.department, department));
  if (status === "active") conditions.push(eq(usersTable.isActive, true));
  if (status === "inactive") conditions.push(eq(usersTable.isActive, false));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [users, countResult] = await Promise.all([
    db.select().from(usersTable).where(whereClause).limit(limitNum).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(usersTable).where(whereClause),
  ]);

  const cicoStatuses = await db.select().from(cicoStatusTable);
  const cicoMap = new Map(cicoStatuses.map(c => [c.employeeId, c]));

  res.json({
    users: users.map(u => ({ ...u, password: undefined, cicoStatus: cicoMap.get(u.employeeId) || null })),
    total: Number(countResult[0].count),
    page: pageNum,
    limit: limitNum,
  });
});

router.get("/:userId", requireAuth as any, async (req, res) => {
  const userId = parseInt(req.params.userId);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "not_found", message: "User not found" }); return; }
  const [cicoStatus] = await db.select().from(cicoStatusTable).where(eq(cicoStatusTable.employeeId, user.employeeId));
  res.json({ ...user, password: undefined, cicoStatus: cicoStatus || null });
});

router.patch("/:userId", requireAuth as any, async (req, res) => {
  const userId = parseInt(req.params.userId);
  const currentUser = (req as any).user;
  if (currentUser.id !== userId && currentUser.role !== "admin") {
    res.status(403).json({ error: "forbidden", message: "Access denied" });
    return;
  }
  const { name, phone, department, position, avatarUrl, role, isActive } = req.body;
  const update: any = { updatedAt: new Date() };
  if (name) update.name = name;
  if (phone !== undefined) update.phone = phone;
  if (department !== undefined) update.department = department;
  if (position !== undefined) update.position = position;
  if (avatarUrl !== undefined) update.avatarUrl = avatarUrl;
  if (role && currentUser.role === "admin") update.role = role;
  if (isActive !== undefined && currentUser.role === "admin") update.isActive = isActive;
  const [updated] = await db.update(usersTable).set(update).where(eq(usersTable.id, userId)).returning();
  await logAudit({ userId: currentUser.id, action: "update_user", entityType: "user", entityId: userId, req });
  res.json({ ...updated, password: undefined });
});

router.post("/:userId/deactivate", requireAdmin as any, async (req, res) => {
  const userId = parseInt(req.params.userId);
  const currentUser = (req as any).user;
  await db.update(usersTable).set({ isActive: false, updatedAt: new Date() }).where(eq(usersTable.id, userId));
  await logAudit({ userId: currentUser.id, action: "deactivate_user", entityType: "user", entityId: userId, req });
  res.json({ success: true, message: "User deactivated" });
});

export default router;
