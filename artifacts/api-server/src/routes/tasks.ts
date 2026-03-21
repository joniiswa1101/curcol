import { Router } from "express";
import { db, tasksTable, taskCommentsTable, taskLabelsTable, usersTable } from "@workspace/db";
import { eq, desc, asc, sql, and, inArray, isNull, or, ilike } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { logAudit } from "../lib/audit.js";
import { sanitizeUser } from "../lib/sanitize.js";
import { broadcastToUser } from "../lib/websocket.js";

const router = Router();

router.get("/", requireAuth as any, async (req, res) => {
  try {
    const currentUser = (req as any).user;
    const {
      status,
      priority,
      assignee,
      search,
      page = "1",
      limit = "50",
      view = "all",
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    const conditions: any[] = [eq(tasksTable.isArchived, false)];

    if (status && status !== "all") {
      conditions.push(eq(tasksTable.status, status as any));
    }
    if (priority && priority !== "all") {
      conditions.push(eq(tasksTable.priority, priority as any));
    }
    if (assignee === "me") {
      conditions.push(eq(tasksTable.assigneeId, currentUser.id));
    } else if (assignee === "unassigned") {
      conditions.push(isNull(tasksTable.assigneeId));
    } else if (assignee && assignee !== "all") {
      conditions.push(eq(tasksTable.assigneeId, parseInt(assignee as string)));
    }
    if (view === "my") {
      conditions.push(
        or(
          eq(tasksTable.assigneeId, currentUser.id),
          eq(tasksTable.creatorId, currentUser.id)
        )
      );
    }
    if (search) {
      conditions.push(
        or(
          ilike(tasksTable.title, `%${search}%`),
          ilike(tasksTable.description, `%${search}%`)
        )
      );
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    const [tasks, countResult] = await Promise.all([
      db.select().from(tasksTable)
        .where(whereClause)
        .orderBy(desc(tasksTable.createdAt))
        .limit(limitNum)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(tasksTable).where(whereClause),
    ]);

    const userIds = [...new Set([
      ...tasks.map(t => t.creatorId),
      ...tasks.filter(t => t.assigneeId).map(t => t.assigneeId!),
    ])];

    const users = userIds.length > 0
      ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
      : [];
    const userMap = new Map(users.map(u => [u.id, sanitizeUser(u)]));

    const taskIds = tasks.map(t => t.id);
    const labels = taskIds.length > 0
      ? await db.select().from(taskLabelsTable).where(inArray(taskLabelsTable.taskId, taskIds))
      : [];
    const labelMap = new Map<number, string[]>();
    labels.forEach(l => {
      if (!labelMap.has(l.taskId)) labelMap.set(l.taskId, []);
      labelMap.get(l.taskId)!.push(l.label);
    });

    const commentCounts = taskIds.length > 0
      ? await db.select({
          taskId: taskCommentsTable.taskId,
          count: sql<number>`count(*)`,
        })
        .from(taskCommentsTable)
        .where(inArray(taskCommentsTable.taskId, taskIds))
        .groupBy(taskCommentsTable.taskId)
      : [];
    const commentMap = new Map(commentCounts.map(c => [c.taskId, Number(c.count)]));

    res.json({
      tasks: tasks.map(t => ({
        ...t,
        creator: userMap.get(t.creatorId) || null,
        assignee: t.assigneeId ? userMap.get(t.assigneeId) || null : null,
        labels: labelMap.get(t.id) || [],
        commentCount: commentMap.get(t.id) || 0,
      })),
      total: Number(countResult[0].count),
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    console.error("Error fetching tasks:", err);
    res.status(500).json({ error: "Gagal mengambil data task" });
  }
});

router.get("/stats", requireAuth as any, async (req, res) => {
  try {
    const stats = await db.select({
      status: tasksTable.status,
      count: sql<number>`count(*)`,
    })
    .from(tasksTable)
    .where(eq(tasksTable.isArchived, false))
    .groupBy(tasksTable.status);

    const priorityStats = await db.select({
      priority: tasksTable.priority,
      count: sql<number>`count(*)`,
    })
    .from(tasksTable)
    .where(eq(tasksTable.isArchived, false))
    .groupBy(tasksTable.priority);

    const overdue = await db.select({
      count: sql<number>`count(*)`,
    })
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.isArchived, false),
        sql`${tasksTable.dueDate} < NOW()`,
        sql`${tasksTable.status} NOT IN ('done', 'cancelled')`
      )
    );

    res.json({
      byStatus: Object.fromEntries(stats.map(s => [s.status, Number(s.count)])),
      byPriority: Object.fromEntries(priorityStats.map(s => [s.priority, Number(s.count)])),
      overdue: Number(overdue[0].count),
    });
  } catch (err) {
    console.error("Error fetching task stats:", err);
    res.status(500).json({ error: "Gagal mengambil statistik task" });
  }
});

router.get("/:id", requireAuth as any, async (req, res) => {
  try {
    const currentUser = (req as any).user;
    const taskId = parseInt(req.params.id);
    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));

    if (!task) {
      return res.status(404).json({ error: "Task tidak ditemukan" });
    }

    if (task.creatorId !== currentUser.id && task.assigneeId !== currentUser.id && currentUser.role !== "admin") {
      return res.status(403).json({ error: "Anda tidak memiliki akses ke task ini" });
    }

    const userIds = [task.creatorId, ...(task.assigneeId ? [task.assigneeId] : [])];
    const users = await db.select().from(usersTable).where(inArray(usersTable.id, userIds));
    const userMap = new Map(users.map(u => [u.id, sanitizeUser(u)]));

    const labels = await db.select().from(taskLabelsTable).where(eq(taskLabelsTable.taskId, taskId));

    const comments = await db.select().from(taskCommentsTable)
      .where(eq(taskCommentsTable.taskId, taskId))
      .orderBy(asc(taskCommentsTable.createdAt));

    const commentUserIds = [...new Set(comments.map(c => c.userId))];
    const commentUsers = commentUserIds.length > 0
      ? await db.select().from(usersTable).where(inArray(usersTable.id, commentUserIds))
      : [];
    const commentUserMap = new Map(commentUsers.map(u => [u.id, sanitizeUser(u)]));

    res.json({
      ...task,
      creator: userMap.get(task.creatorId) || null,
      assignee: task.assigneeId ? userMap.get(task.assigneeId) || null : null,
      labels: labels.map(l => l.label),
      comments: comments.map(c => ({
        ...c,
        user: commentUserMap.get(c.userId) || null,
      })),
    });
  } catch (err) {
    console.error("Error fetching task:", err);
    res.status(500).json({ error: "Gagal mengambil detail task" });
  }
});

router.post("/", requireAuth as any, async (req, res) => {
  try {
    const currentUser = (req as any).user;
    const { title, description, status, priority, assigneeId, dueDate, conversationId, labels } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Judul task wajib diisi" });
    }

    const [task] = await db.insert(tasksTable).values({
      title: title.trim(),
      description: description?.trim() || null,
      status: status || "todo",
      priority: priority || "medium",
      creatorId: currentUser.id,
      assigneeId: assigneeId || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      conversationId: conversationId || null,
      updatedAt: new Date(),
    }).returning();

    if (labels && labels.length > 0) {
      await db.insert(taskLabelsTable).values(
        labels.map((label: string) => ({ taskId: task.id, label }))
      );
    }

    await logAudit({
      userId: currentUser.id,
      action: "create_task",
      entityType: "task",
      entityId: task.id,
      req,
    });

    let assigneeData = null;
    if (assigneeId) {
      const [assigneeUser] = await db.select().from(usersTable).where(eq(usersTable.id, assigneeId));
      if (assigneeUser) assigneeData = sanitizeUser(assigneeUser);
      if (assigneeId !== currentUser.id) {
        broadcastToUser(assigneeId, {
          type: "task_assigned",
          task: { ...task, creator: sanitizeUser(currentUser) },
        });
      }
    }

    res.status(201).json({
      ...task,
      creator: sanitizeUser(currentUser),
      assignee: assigneeData,
      labels: labels || [],
      commentCount: 0,
    });
  } catch (err) {
    console.error("Error creating task:", err);
    res.status(500).json({ error: "Gagal membuat task" });
  }
});

router.patch("/:id", requireAuth as any, async (req, res) => {
  try {
    const currentUser = (req as any).user;
    const taskId = parseInt(req.params.id);
    const { title, description, status, priority, assigneeId, dueDate, labels } = req.body;

    const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
    if (!existing) {
      return res.status(404).json({ error: "Task tidak ditemukan" });
    }

    if (existing.creatorId !== currentUser.id && existing.assigneeId !== currentUser.id && currentUser.role !== "admin") {
      return res.status(403).json({ error: "Anda tidak memiliki akses untuk mengubah task ini" });
    }

    const updates: any = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description?.trim() || null;
    if (status !== undefined) {
      updates.status = status;
      if (status === "done") updates.completedAt = new Date();
      if (status !== "done" && existing.status === "done") updates.completedAt = null;
    }
    if (priority !== undefined) updates.priority = priority;
    if (assigneeId !== undefined) updates.assigneeId = assigneeId || null;
    if (dueDate !== undefined) updates.dueDate = dueDate ? new Date(dueDate) : null;

    const [updated] = await db.update(tasksTable)
      .set(updates)
      .where(eq(tasksTable.id, taskId))
      .returning();

    if (labels !== undefined) {
      await db.delete(taskLabelsTable).where(eq(taskLabelsTable.taskId, taskId));
      if (labels.length > 0) {
        await db.insert(taskLabelsTable).values(
          labels.map((label: string) => ({ taskId: taskId, label }))
        );
      }
    }

    await logAudit({
      userId: currentUser.id,
      action: "update_task",
      entityType: "task",
      entityId: taskId,
      details: updates,
      req,
    });

    if (assigneeId !== undefined && assigneeId && assigneeId !== currentUser.id && assigneeId !== existing.assigneeId) {
      broadcastToUser(assigneeId, {
        type: "task_assigned",
        task: updated,
      });
    }

    res.json(updated);
  } catch (err) {
    console.error("Error updating task:", err);
    res.status(500).json({ error: "Gagal mengupdate task" });
  }
});

router.delete("/:id", requireAuth as any, async (req, res) => {
  try {
    const currentUser = (req as any).user;
    const taskId = parseInt(req.params.id);

    const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
    if (!existing) {
      return res.status(404).json({ error: "Task tidak ditemukan" });
    }

    if (existing.creatorId !== currentUser.id && currentUser.role !== "admin") {
      return res.status(403).json({ error: "Hanya pembuat task atau admin yang bisa menghapus" });
    }

    await db.delete(tasksTable).where(eq(tasksTable.id, taskId));

    await logAudit({
      userId: currentUser.id,
      action: "delete_task",
      entityType: "task",
      entityId: taskId,
      req,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting task:", err);
    res.status(500).json({ error: "Gagal menghapus task" });
  }
});

router.post("/:id/comments", requireAuth as any, async (req, res) => {
  try {
    const currentUser = (req as any).user;
    const taskId = parseInt(req.params.id);
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Komentar tidak boleh kosong" });
    }

    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
    if (!task) {
      return res.status(404).json({ error: "Task tidak ditemukan" });
    }

    if (task.creatorId !== currentUser.id && task.assigneeId !== currentUser.id && currentUser.role !== "admin") {
      return res.status(403).json({ error: "Anda tidak memiliki akses untuk mengomentari task ini" });
    }

    const [comment] = await db.insert(taskCommentsTable).values({
      taskId,
      userId: currentUser.id,
      content: content.trim(),
    }).returning();

    const notifyUserIds = [task.creatorId, task.assigneeId].filter(
      (id): id is number => id !== null && id !== currentUser.id
    );
    notifyUserIds.forEach(userId => {
      broadcastToUser(userId, {
        type: "task_comment",
        taskId,
        comment: { ...comment, user: sanitizeUser(currentUser) },
      });
    });

    res.status(201).json({
      ...comment,
      user: sanitizeUser(currentUser),
    });
  } catch (err) {
    console.error("Error adding comment:", err);
    res.status(500).json({ error: "Gagal menambahkan komentar" });
  }
});

router.get("/:id/comments", requireAuth as any, async (req, res) => {
  try {
    const currentUser = (req as any).user;
    const taskId = parseInt(req.params.id);

    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
    if (!task) {
      return res.status(404).json({ error: "Task tidak ditemukan" });
    }
    if (task.creatorId !== currentUser.id && task.assigneeId !== currentUser.id && currentUser.role !== "admin") {
      return res.status(403).json({ error: "Anda tidak memiliki akses ke komentar task ini" });
    }

    const comments = await db.select().from(taskCommentsTable)
      .where(eq(taskCommentsTable.taskId, taskId))
      .orderBy(asc(taskCommentsTable.createdAt));

    const userIds = [...new Set(comments.map(c => c.userId))];
    const users = userIds.length > 0
      ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
      : [];
    const userMap = new Map(users.map(u => [u.id, sanitizeUser(u)]));

    res.json(comments.map(c => ({
      ...c,
      user: userMap.get(c.userId) || null,
    })));
  } catch (err) {
    console.error("Error fetching comments:", err);
    res.status(500).json({ error: "Gagal mengambil komentar" });
  }
});

export default router;
