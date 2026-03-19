import { Router } from "express";
import { db, auditLogsTable, usersTable, messagesTable, conversationsTable } from "@workspace/db";
import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";
import { requireAdmin } from "../lib/auth.js";
import { sanitizeUser } from "../lib/sanitize.js";

const router = Router();

router.get("/logs", requireAdmin as any, async (req, res) => {
  const { userId, action, conversationId, startDate, endDate, page = "1", limit = "50" } = req.query as any;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  const conditions: any[] = [];
  if (userId) conditions.push(eq(auditLogsTable.userId, parseInt(userId)));
  if (action) conditions.push(eq(auditLogsTable.action, action));
  if (conversationId) conditions.push(eq(auditLogsTable.entityId, parseInt(conversationId)));
  if (startDate) conditions.push(gte(auditLogsTable.createdAt, new Date(startDate)));
  if (endDate) conditions.push(lte(auditLogsTable.createdAt, new Date(endDate + "T23:59:59")));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [logs, countResult] = await Promise.all([
    db.select().from(auditLogsTable).where(whereClause).orderBy(desc(auditLogsTable.createdAt)).limit(limitNum).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(auditLogsTable).where(whereClause),
  ]);

  const userIds = [...new Set(logs.map(l => l.userId).filter(Boolean) as number[])];
  const users = userIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const userMap = new Map(users.map(u => [u.id, sanitizeUser(u)]));

  res.json({
    logs: logs.map(l => ({ ...l, user: l.userId ? (userMap.get(l.userId) || null) : null })),
    total: Number(countResult[0].count),
    page: pageNum,
    limit: limitNum,
  });
});

router.get("/conversations/:conversationId/export", requireAdmin as any, async (req, res) => {
  const convId = parseInt(req.params.conversationId);
  const format = (req.query.format as string) || "json";

  const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, convId));
  if (!conv) { res.status(404).json({ error: "not_found" }); return; }

  const messages = await db.select().from(messagesTable)
    .where(eq(messagesTable.conversationId, convId))
    .orderBy(messagesTable.createdAt);

  const senderIds = [...new Set(messages.map(m => m.senderId))];
  const senders = senderIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, senderIds))
    : [];
  const senderMap = new Map(senders.map(u => [u.id, { name: u.name, employeeId: u.employeeId }]));

  const enriched = messages.map(m => ({
    id: m.id,
    sender: senderMap.get(m.senderId),
    content: m.isDeleted ? "[Message deleted]" : m.content,
    type: m.type,
    isEdited: m.isEdited,
    isDeleted: m.isDeleted,
    createdAt: m.createdAt,
    editedAt: m.editedAt,
  }));

  let data: string;
  let filename: string;
  if (format === "csv") {
    const header = "id,sender_name,employee_id,content,type,is_edited,is_deleted,created_at,edited_at\n";
    const rows = enriched.map(m =>
      `${m.id},"${m.sender?.name || ""}","${m.sender?.employeeId || ""}","${(m.content || "").replace(/"/g, '""')}",${m.type},${m.isEdited},${m.isDeleted},${m.createdAt},${m.editedAt || ""}`
    ).join("\n");
    data = header + rows;
    filename = `conversation_${convId}_export.csv`;
  } else {
    data = JSON.stringify({ conversation: conv, messages: enriched }, null, 2);
    filename = `conversation_${convId}_export.json`;
  }

  res.json({ data, format, filename });
});

router.get("/stats", requireAdmin as any, async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastWeekStart = new Date(today);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const prevWeekStart = new Date(lastWeekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);

  const [
    totalMsgResult, totalUsersResult, activeUsersTodayResult, totalConvsResult,
    messagesPerDayResult, topUsersResult,
    msgThisWeek, msgLastWeek,
    messagesTodayResult,
    actionDistributionResult,
    loginActivityResult
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(messagesTable),
    db.select({ count: sql<number>`count(*)` }).from(usersTable).where(eq(usersTable.isActive, true)),
    db.select({ count: sql<number>`count(distinct sender_id)` }).from(messagesTable).where(gte(messagesTable.createdAt, today)),
    db.select({ count: sql<number>`count(*)` }).from(conversationsTable),
    db.execute(sql`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM messages
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `),
    db.execute(sql`
      SELECT m.sender_id as "userId", u.name, COUNT(*) as "messageCount"
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      GROUP BY m.sender_id, u.name
      ORDER BY "messageCount" DESC
      LIMIT 10
    `),
    db.select({ count: sql<number>`count(*)` }).from(messagesTable).where(gte(messagesTable.createdAt, lastWeekStart)),
    db.select({ count: sql<number>`count(*)` }).from(messagesTable).where(and(gte(messagesTable.createdAt, prevWeekStart), lte(messagesTable.createdAt, lastWeekStart))),
    db.select({ count: sql<number>`count(*)` }).from(messagesTable).where(gte(messagesTable.createdAt, today)),
    db.execute(sql`
      SELECT action, COUNT(*) as count
      FROM audit_logs
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY action
      ORDER BY count DESC
      LIMIT 15
    `),
    db.execute(sql`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM audit_logs
      WHERE action IN ('login_success', 'login_failed', 'sso_login_success')
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `),
  ]);

  const thisWeekCount = Number(msgThisWeek[0].count);
  const lastWeekCount = Number(msgLastWeek[0].count);
  const weeklyTrend = lastWeekCount > 0
    ? Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100)
    : 0;

  res.json({
    totalMessages: Number(totalMsgResult[0].count),
    totalUsers: Number(totalUsersResult[0].count),
    activeUsersToday: Number(activeUsersTodayResult[0].count),
    totalConversations: Number(totalConvsResult[0].count),
    messagesToday: Number(messagesTodayResult[0].count),
    weeklyTrend,
    messagesPerDay: (messagesPerDayResult.rows || []).map((r: any) => ({ date: r.date, count: Number(r.count) })),
    topActiveUsers: (topUsersResult.rows || []).map((r: any) => ({
      userId: r.userId,
      name: r.name,
      messageCount: Number(r.messageCount),
    })),
    actionDistribution: (actionDistributionResult.rows || []).map((r: any) => ({
      action: r.action,
      count: Number(r.count),
    })),
    loginActivity: (loginActivityResult.rows || []).map((r: any) => ({
      date: r.date,
      count: Number(r.count),
    })),
  });
});

export default router;
