import { Router } from "express";
import { db, complianceFlagsTable, usersTable, conversationsTable } from "@workspace/db";
import { eq, desc, and, sql, count } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { logAudit } from "../lib/audit.js";
import { detectPII, redactContent, getPIITypeLabel, getSeverityLabel } from "../lib/compliance.js";

const router = Router();

function requireAdmin(req: any, res: any, next: any) {
  if ((req as any).user?.role !== "admin") {
    res.status(403).json({ error: "forbidden", message: "Admin access required" });
    return;
  }
  next();
}

router.get("/flags", requireAuth as any, requireAdmin, async (req, res) => {
  const { status, severity, page = "1", limit = "20" } = req.query;
  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

  let conditions: any[] = [];
  if (status && status !== "all") conditions.push(eq(complianceFlagsTable.status, status as string));
  if (severity && severity !== "all") conditions.push(eq(complianceFlagsTable.severity, severity as string));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = await db.select({ count: count() })
    .from(complianceFlagsTable)
    .where(whereClause);

  const flags = await db.select({
    id: complianceFlagsTable.id,
    messageId: complianceFlagsTable.messageId,
    conversationId: complianceFlagsTable.conversationId,
    userId: complianceFlagsTable.userId,
    flagType: complianceFlagsTable.flagType,
    piiTypes: complianceFlagsTable.piiTypes,
    originalContent: complianceFlagsTable.originalContent,
    redactedContent: complianceFlagsTable.redactedContent,
    severity: complianceFlagsTable.severity,
    status: complianceFlagsTable.status,
    reviewedById: complianceFlagsTable.reviewedById,
    reviewedAt: complianceFlagsTable.reviewedAt,
    reviewNote: complianceFlagsTable.reviewNote,
    createdAt: complianceFlagsTable.createdAt,
    userName: usersTable.name,
    userDepartment: sql<string>`(SELECT department FROM users WHERE id = ${complianceFlagsTable.userId})`,
    conversationName: sql<string>`(SELECT name FROM conversations WHERE id = ${complianceFlagsTable.conversationId})`,
    conversationType: sql<string>`(SELECT type FROM conversations WHERE id = ${complianceFlagsTable.conversationId})`,
    reviewerName: sql<string>`(SELECT name FROM users WHERE id = ${complianceFlagsTable.reviewedById})`,
  })
    .from(complianceFlagsTable)
    .leftJoin(usersTable, eq(complianceFlagsTable.userId, usersTable.id))
    .where(whereClause)
    .orderBy(desc(complianceFlagsTable.createdAt))
    .limit(parseInt(limit as string))
    .offset(offset);

  res.json({
    flags,
    total: totalResult?.count || 0,
    page: parseInt(page as string),
    limit: parseInt(limit as string),
    totalPages: Math.ceil((totalResult?.count || 0) / parseInt(limit as string)),
  });
});

router.get("/stats", requireAuth as any, requireAdmin, async (req, res) => {
  const [totalFlags] = await db.select({ count: count() }).from(complianceFlagsTable);
  const [pendingFlags] = await db.select({ count: count() }).from(complianceFlagsTable).where(eq(complianceFlagsTable.status, "pending"));
  const [reviewedFlags] = await db.select({ count: count() }).from(complianceFlagsTable).where(eq(complianceFlagsTable.status, "reviewed"));
  const [dismissedFlags] = await db.select({ count: count() }).from(complianceFlagsTable).where(eq(complianceFlagsTable.status, "dismissed"));
  const [escalatedFlags] = await db.select({ count: count() }).from(complianceFlagsTable).where(eq(complianceFlagsTable.status, "escalated"));

  const [criticalFlags] = await db.select({ count: count() }).from(complianceFlagsTable).where(eq(complianceFlagsTable.severity, "critical"));
  const [highFlags] = await db.select({ count: count() }).from(complianceFlagsTable).where(eq(complianceFlagsTable.severity, "high"));
  const [mediumFlags] = await db.select({ count: count() }).from(complianceFlagsTable).where(eq(complianceFlagsTable.severity, "medium"));
  const [lowFlags] = await db.select({ count: count() }).from(complianceFlagsTable).where(eq(complianceFlagsTable.severity, "low"));

  const [blockedFlags] = await db.select({ count: count() }).from(complianceFlagsTable).where(eq(complianceFlagsTable.flagType, "blocked"));
  const [piiFlags] = await db.select({ count: count() }).from(complianceFlagsTable).where(eq(complianceFlagsTable.flagType, "pii_detected"));
  const [riskyFlags] = await db.select({ count: count() }).from(complianceFlagsTable).where(eq(complianceFlagsTable.flagType, "risky_content"));

  const recentFlags = await db.select({
    date: sql<string>`DATE(${complianceFlagsTable.createdAt})`,
    count: count(),
  })
    .from(complianceFlagsTable)
    .where(sql`${complianceFlagsTable.createdAt} > NOW() - INTERVAL '30 days'`)
    .groupBy(sql`DATE(${complianceFlagsTable.createdAt})`)
    .orderBy(sql`DATE(${complianceFlagsTable.createdAt})`);

  const topUsers = await db.select({
    userId: complianceFlagsTable.userId,
    userName: usersTable.name,
    count: count(),
  })
    .from(complianceFlagsTable)
    .leftJoin(usersTable, eq(complianceFlagsTable.userId, usersTable.id))
    .groupBy(complianceFlagsTable.userId, usersTable.name)
    .orderBy(desc(count()))
    .limit(10);

  res.json({
    total: totalFlags?.count || 0,
    byStatus: {
      pending: pendingFlags?.count || 0,
      reviewed: reviewedFlags?.count || 0,
      dismissed: dismissedFlags?.count || 0,
      escalated: escalatedFlags?.count || 0,
    },
    bySeverity: {
      critical: criticalFlags?.count || 0,
      high: highFlags?.count || 0,
      medium: mediumFlags?.count || 0,
      low: lowFlags?.count || 0,
    },
    byType: {
      blocked: blockedFlags?.count || 0,
      pii_detected: piiFlags?.count || 0,
      risky_content: riskyFlags?.count || 0,
    },
    recentTrend: recentFlags,
    topUsers,
  });
});

router.patch("/flags/:id", requireAuth as any, requireAdmin, async (req, res) => {
  const flagId = parseInt(req.params.id);
  const currentUser = (req as any).user;
  const { status, reviewNote } = req.body;

  if (!["reviewed", "dismissed", "escalated", "pending"].includes(status)) {
    res.status(400).json({ error: "bad_request", message: "Invalid status" });
    return;
  }

  const [flag] = await db.select().from(complianceFlagsTable).where(eq(complianceFlagsTable.id, flagId));
  if (!flag) { res.status(404).json({ error: "not_found" }); return; }

  await db.update(complianceFlagsTable).set({
    status,
    reviewedById: currentUser.id,
    reviewedAt: new Date(),
    reviewNote: reviewNote || null,
  }).where(eq(complianceFlagsTable.id, flagId));

  await logAudit({
    userId: currentUser.id,
    action: "compliance_review",
    entityType: "compliance_flag",
    entityId: flagId,
    details: { status, reviewNote, previousStatus: flag.status },
    req,
  });

  res.json({ success: true, message: "Flag updated" });
});

router.post("/scan", requireAuth as any, async (req, res) => {
  const { content } = req.body;
  if (!content) { res.status(400).json({ error: "bad_request", message: "Content required" }); return; }

  const result = detectPII(content);
  const redacted = redactContent(content);

  res.json({
    ...result,
    redactedContent: redacted,
    matchDetails: result.matches.map(m => ({
      ...m,
      typeLabel: getPIITypeLabel(m.type),
    })),
    severityLabel: getSeverityLabel(result.severity),
  });
});

export default router;
