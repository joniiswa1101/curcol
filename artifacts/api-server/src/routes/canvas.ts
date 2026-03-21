import { Router } from "express";
import { db, canvasBoardsTable, canvasElementsTable, canvasBoardMembersTable, usersTable, conversationMembersTable } from "@workspace/db";
import { eq, desc, sql, and, or, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

async function canAccessBoard(userId: number, boardId: number): Promise<{ allowed: boolean; role: string }> {
  const [board] = await db
    .select({ id: canvasBoardsTable.id, createdById: canvasBoardsTable.createdById, isPublic: canvasBoardsTable.isPublic, conversationId: canvasBoardsTable.conversationId })
    .from(canvasBoardsTable)
    .where(eq(canvasBoardsTable.id, boardId));

  if (!board) return { allowed: false, role: "none" };
  if (board.createdById === userId) return { allowed: true, role: "admin" };

  if (board.isPublic) return { allowed: true, role: "editor" };

  const [membership] = await db
    .select({ role: canvasBoardMembersTable.role })
    .from(canvasBoardMembersTable)
    .where(and(
      eq(canvasBoardMembersTable.boardId, boardId),
      eq(canvasBoardMembersTable.userId, userId)
    ));

  if (membership) return { allowed: true, role: membership.role };

  if (board.conversationId) {
    const [convMember] = await db
      .select({ id: conversationMembersTable.id })
      .from(conversationMembersTable)
      .where(and(
        eq(conversationMembersTable.conversationId, board.conversationId),
        eq(conversationMembersTable.userId, userId)
      ));
    if (convMember) return { allowed: true, role: "editor" };
  }

  return { allowed: false, role: "none" };
}

router.get("/boards", requireAuth as any, async (req, res) => {
  try {
    const currentUser = (req as any).user;
    const { conversationId } = req.query;

    if (conversationId) {
      const convId = parseInt(conversationId as string);
      const [membership] = await db
        .select({ id: conversationMembersTable.id })
        .from(conversationMembersTable)
        .where(and(
          eq(conversationMembersTable.conversationId, convId),
          eq(conversationMembersTable.userId, currentUser.id)
        ));
      if (!membership) return res.status(403).json({ error: "Not a member of this conversation" });

      const boards = await db
        .select({
          id: canvasBoardsTable.id,
          name: canvasBoardsTable.name,
          isPublic: canvasBoardsTable.isPublic,
          conversationId: canvasBoardsTable.conversationId,
          createdById: canvasBoardsTable.createdById,
          thumbnail: canvasBoardsTable.thumbnail,
          createdAt: canvasBoardsTable.createdAt,
          updatedAt: canvasBoardsTable.updatedAt,
          creatorName: usersTable.name,
          creatorAvatar: usersTable.avatarUrl,
        })
        .from(canvasBoardsTable)
        .leftJoin(usersTable, eq(canvasBoardsTable.createdById, usersTable.id))
        .where(eq(canvasBoardsTable.conversationId, convId))
        .orderBy(desc(canvasBoardsTable.updatedAt));
      return res.json(boards);
    }

    const memberBoardIds = await db
      .select({ boardId: canvasBoardMembersTable.boardId })
      .from(canvasBoardMembersTable)
      .where(eq(canvasBoardMembersTable.userId, currentUser.id));

    const memberIds = memberBoardIds.map(m => m.boardId);

    const conditions = memberIds.length > 0
      ? or(
          eq(canvasBoardsTable.isPublic, true),
          eq(canvasBoardsTable.createdById, currentUser.id),
          inArray(canvasBoardsTable.id, memberIds)
        )
      : or(
          eq(canvasBoardsTable.isPublic, true),
          eq(canvasBoardsTable.createdById, currentUser.id)
        );

    const boards = await db
      .select({
        id: canvasBoardsTable.id,
        name: canvasBoardsTable.name,
        isPublic: canvasBoardsTable.isPublic,
        conversationId: canvasBoardsTable.conversationId,
        createdById: canvasBoardsTable.createdById,
        thumbnail: canvasBoardsTable.thumbnail,
        createdAt: canvasBoardsTable.createdAt,
        updatedAt: canvasBoardsTable.updatedAt,
        creatorName: usersTable.name,
        creatorAvatar: usersTable.avatarUrl,
      })
      .from(canvasBoardsTable)
      .leftJoin(usersTable, eq(canvasBoardsTable.createdById, usersTable.id))
      .where(conditions)
      .orderBy(desc(canvasBoardsTable.updatedAt));

    res.json(boards);
  } catch (e) {
    console.error("[Canvas] Error fetching boards:", e);
    res.status(500).json({ error: "Failed to fetch boards" });
  }
});

router.post("/boards", requireAuth as any, async (req, res) => {
  try {
    const currentUser = (req as any).user;
    const { name, conversationId, isPublic } = req.body;

    if (conversationId) {
      const [membership] = await db
        .select({ id: conversationMembersTable.id })
        .from(conversationMembersTable)
        .where(and(
          eq(conversationMembersTable.conversationId, conversationId),
          eq(conversationMembersTable.userId, currentUser.id)
        ));
      if (!membership) return res.status(403).json({ error: "Not a member of this conversation" });
    }

    const [board] = await db
      .insert(canvasBoardsTable)
      .values({
        name: name || "Untitled Board",
        isPublic: isPublic !== undefined ? isPublic : true,
        conversationId: conversationId || null,
        createdById: currentUser.id,
      })
      .returning();

    res.json(board);
  } catch (e) {
    console.error("[Canvas] Error creating board:", e);
    res.status(500).json({ error: "Failed to create board" });
  }
});

router.get("/boards/:id", requireAuth as any, async (req, res) => {
  try {
    const currentUser = (req as any).user;
    const boardId = parseInt(req.params.id);

    const access = await canAccessBoard(currentUser.id, boardId);
    if (!access.allowed) return res.status(403).json({ error: "Access denied" });

    const [board] = await db
      .select({
        id: canvasBoardsTable.id,
        name: canvasBoardsTable.name,
        isPublic: canvasBoardsTable.isPublic,
        conversationId: canvasBoardsTable.conversationId,
        createdById: canvasBoardsTable.createdById,
        thumbnail: canvasBoardsTable.thumbnail,
        createdAt: canvasBoardsTable.createdAt,
        updatedAt: canvasBoardsTable.updatedAt,
        creatorName: usersTable.name,
        creatorAvatar: usersTable.avatarUrl,
      })
      .from(canvasBoardsTable)
      .leftJoin(usersTable, eq(canvasBoardsTable.createdById, usersTable.id))
      .where(eq(canvasBoardsTable.id, boardId));

    if (!board) return res.status(404).json({ error: "Board not found" });

    const members = await db
      .select({
        id: canvasBoardMembersTable.id,
        userId: canvasBoardMembersTable.userId,
        role: canvasBoardMembersTable.role,
        addedAt: canvasBoardMembersTable.addedAt,
        userName: usersTable.name,
        userAvatar: usersTable.avatarUrl,
        userDepartment: usersTable.department,
      })
      .from(canvasBoardMembersTable)
      .leftJoin(usersTable, eq(canvasBoardMembersTable.userId, usersTable.id))
      .where(eq(canvasBoardMembersTable.boardId, boardId));

    res.json({ ...board, members, userRole: access.role });
  } catch (e) {
    console.error("[Canvas] Error fetching board:", e);
    res.status(500).json({ error: "Failed to fetch board" });
  }
});

router.patch("/boards/:id", requireAuth as any, async (req, res) => {
  try {
    const currentUser = (req as any).user;
    const boardId = parseInt(req.params.id);
    const { name, isPublic } = req.body;

    const [existing] = await db.select({ createdById: canvasBoardsTable.createdById })
      .from(canvasBoardsTable).where(eq(canvasBoardsTable.id, boardId));
    if (!existing) return res.status(404).json({ error: "Board not found" });

    const access = await canAccessBoard(currentUser.id, boardId);
    if (access.role !== "admin") return res.status(403).json({ error: "Only board admin can update settings" });

    const updates: any = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (isPublic !== undefined) updates.isPublic = isPublic;

    const [board] = await db
      .update(canvasBoardsTable)
      .set(updates)
      .where(eq(canvasBoardsTable.id, boardId))
      .returning();

    res.json(board);
  } catch (e) {
    console.error("[Canvas] Error updating board:", e);
    res.status(500).json({ error: "Failed to update board" });
  }
});

router.delete("/boards/:id", requireAuth as any, async (req, res) => {
  try {
    const currentUser = (req as any).user;
    const boardId = parseInt(req.params.id);

    const access = await canAccessBoard(currentUser.id, boardId);
    if (access.role !== "admin") return res.status(403).json({ error: "Only board admin can delete" });

    await db.delete(canvasBoardsTable).where(eq(canvasBoardsTable.id, boardId));
    res.json({ success: true });
  } catch (e) {
    console.error("[Canvas] Error deleting board:", e);
    res.status(500).json({ error: "Failed to delete board" });
  }
});

router.post("/boards/:id/members", requireAuth as any, async (req, res) => {
  try {
    const currentUser = (req as any).user;
    const boardId = parseInt(req.params.id);
    const { userId, role } = req.body;

    const access = await canAccessBoard(currentUser.id, boardId);
    if (access.role !== "admin") return res.status(403).json({ error: "Only board admin can manage members" });

    const validRole = ["viewer", "editor", "admin"].includes(role) ? role : "viewer";

    const [member] = await db
      .insert(canvasBoardMembersTable)
      .values({ boardId, userId, role: validRole })
      .onConflictDoUpdate({
        target: [canvasBoardMembersTable.boardId, canvasBoardMembersTable.userId],
        set: { role: validRole },
      })
      .returning();

    const [userInfo] = await db.select({ name: usersTable.name, avatarUrl: usersTable.avatarUrl, department: usersTable.department })
      .from(usersTable).where(eq(usersTable.id, userId));

    res.json({ ...member, userName: userInfo?.name, userAvatar: userInfo?.avatarUrl, userDepartment: userInfo?.department });
  } catch (e) {
    console.error("[Canvas] Error adding member:", e);
    res.status(500).json({ error: "Failed to add member" });
  }
});

router.delete("/boards/:id/members/:userId", requireAuth as any, async (req, res) => {
  try {
    const currentUser = (req as any).user;
    const boardId = parseInt(req.params.id);
    const targetUserId = parseInt(req.params.userId);

    const access = await canAccessBoard(currentUser.id, boardId);
    if (access.role !== "admin" && currentUser.id !== targetUserId) {
      return res.status(403).json({ error: "Only board admin or the member themselves can remove" });
    }

    await db.delete(canvasBoardMembersTable)
      .where(and(
        eq(canvasBoardMembersTable.boardId, boardId),
        eq(canvasBoardMembersTable.userId, targetUserId)
      ));

    res.json({ success: true });
  } catch (e) {
    console.error("[Canvas] Error removing member:", e);
    res.status(500).json({ error: "Failed to remove member" });
  }
});

router.get("/boards/:id/members", requireAuth as any, async (req, res) => {
  try {
    const currentUser = (req as any).user;
    const boardId = parseInt(req.params.id);

    const access = await canAccessBoard(currentUser.id, boardId);
    if (!access.allowed) return res.status(403).json({ error: "Access denied" });

    const members = await db
      .select({
        id: canvasBoardMembersTable.id,
        userId: canvasBoardMembersTable.userId,
        role: canvasBoardMembersTable.role,
        addedAt: canvasBoardMembersTable.addedAt,
        userName: usersTable.name,
        userAvatar: usersTable.avatarUrl,
        userDepartment: usersTable.department,
      })
      .from(canvasBoardMembersTable)
      .leftJoin(usersTable, eq(canvasBoardMembersTable.userId, usersTable.id))
      .where(eq(canvasBoardMembersTable.boardId, boardId));

    res.json(members);
  } catch (e) {
    console.error("[Canvas] Error fetching members:", e);
    res.status(500).json({ error: "Failed to fetch members" });
  }
});

router.get("/boards/:id/elements", requireAuth as any, async (req, res) => {
  try {
    const currentUser = (req as any).user;
    const boardId = parseInt(req.params.id);

    const access = await canAccessBoard(currentUser.id, boardId);
    if (!access.allowed) return res.status(403).json({ error: "Access denied" });

    const elements = await db
      .select()
      .from(canvasElementsTable)
      .where(eq(canvasElementsTable.boardId, boardId))
      .orderBy(canvasElementsTable.zIndex);

    res.json(elements);
  } catch (e) {
    console.error("[Canvas] Error fetching elements:", e);
    res.status(500).json({ error: "Failed to fetch elements" });
  }
});

router.post("/boards/:id/elements", requireAuth as any, async (req, res) => {
  try {
    const boardId = parseInt(req.params.id);
    const currentUser = (req as any).user;

    const access = await canAccessBoard(currentUser.id, boardId);
    if (!access.allowed) return res.status(403).json({ error: "Access denied" });
    if (access.role === "viewer") return res.status(403).json({ error: "Viewers cannot draw" });

    const { elementType, x, y, width, height, rotation, points, content, style, zIndex } = req.body;

    const [element] = await db
      .insert(canvasElementsTable)
      .values({
        boardId,
        elementType,
        x: x || 0,
        y: y || 0,
        width: width || 0,
        height: height || 0,
        rotation: rotation || 0,
        points: points || null,
        content: content || null,
        style: style || {},
        zIndex: zIndex || 0,
        createdById: currentUser.id,
      })
      .returning();

    await db.update(canvasBoardsTable).set({ updatedAt: new Date() }).where(eq(canvasBoardsTable.id, boardId));

    res.json(element);
  } catch (e) {
    console.error("[Canvas] Error creating element:", e);
    res.status(500).json({ error: "Failed to create element" });
  }
});

router.patch("/boards/:boardId/elements/:elementId", requireAuth as any, async (req, res) => {
  try {
    const elementId = parseInt(req.params.elementId);
    const boardId = parseInt(req.params.boardId);
    const currentUser = (req as any).user;
    const updates = req.body;

    const access = await canAccessBoard(currentUser.id, boardId);
    if (!access.allowed || access.role === "viewer") return res.status(403).json({ error: "Access denied" });

    const [element] = await db
      .update(canvasElementsTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(canvasElementsTable.id, elementId), eq(canvasElementsTable.boardId, boardId)))
      .returning();

    if (!element) return res.status(404).json({ error: "Element not found" });

    await db.update(canvasBoardsTable).set({ updatedAt: new Date() }).where(eq(canvasBoardsTable.id, boardId));

    res.json(element);
  } catch (e) {
    console.error("[Canvas] Error updating element:", e);
    res.status(500).json({ error: "Failed to update element" });
  }
});

router.delete("/boards/:boardId/elements/:elementId", requireAuth as any, async (req, res) => {
  try {
    const elementId = parseInt(req.params.elementId);
    const boardId = parseInt(req.params.boardId);
    const currentUser = (req as any).user;

    const access = await canAccessBoard(currentUser.id, boardId);
    if (!access.allowed || access.role === "viewer") return res.status(403).json({ error: "Access denied" });

    await db.delete(canvasElementsTable).where(and(eq(canvasElementsTable.id, elementId), eq(canvasElementsTable.boardId, boardId)));
    await db.update(canvasBoardsTable).set({ updatedAt: new Date() }).where(eq(canvasBoardsTable.id, boardId));

    res.json({ success: true });
  } catch (e) {
    console.error("[Canvas] Error deleting element:", e);
    res.status(500).json({ error: "Failed to delete element" });
  }
});

router.post("/boards/:id/elements/batch", requireAuth as any, async (req, res) => {
  try {
    const boardId = parseInt(req.params.id);
    const currentUser = (req as any).user;

    const access = await canAccessBoard(currentUser.id, boardId);
    if (!access.allowed || access.role === "viewer") return res.status(403).json({ error: "Access denied" });

    const { elements } = req.body;

    if (!Array.isArray(elements) || elements.length === 0) {
      return res.status(400).json({ error: "Elements array required" });
    }

    const values = elements.map((el: any) => ({
      boardId,
      elementType: el.elementType,
      x: el.x || 0,
      y: el.y || 0,
      width: el.width || 0,
      height: el.height || 0,
      rotation: el.rotation || 0,
      points: el.points || null,
      content: el.content || null,
      style: el.style || {},
      zIndex: el.zIndex || 0,
      createdById: currentUser.id,
    }));

    const inserted = await db.insert(canvasElementsTable).values(values).returning();
    await db.update(canvasBoardsTable).set({ updatedAt: new Date() }).where(eq(canvasBoardsTable.id, boardId));

    res.json(inserted);
  } catch (e) {
    console.error("[Canvas] Error batch creating elements:", e);
    res.status(500).json({ error: "Failed to batch create elements" });
  }
});

export default router;
