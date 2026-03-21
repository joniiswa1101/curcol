import { Router } from "express";
import { db, canvasBoardsTable, canvasElementsTable, usersTable, conversationMembersTable } from "@workspace/db";
import { eq, desc, sql, and, or } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

async function canAccessBoard(userId: number, boardId: number): Promise<boolean> {
  const [board] = await db
    .select({ id: canvasBoardsTable.id, createdById: canvasBoardsTable.createdById, conversationId: canvasBoardsTable.conversationId })
    .from(canvasBoardsTable)
    .where(eq(canvasBoardsTable.id, boardId));

  if (!board) return false;
  if (board.createdById === userId) return true;
  if (!board.conversationId) return true;

  const [membership] = await db
    .select({ id: conversationMembersTable.id })
    .from(conversationMembersTable)
    .where(and(
      eq(conversationMembersTable.conversationId, board.conversationId),
      eq(conversationMembersTable.userId, userId)
    ));

  return !!membership;
}

router.get("/boards", requireAuth as any, async (req, res) => {
  try {
    const currentUser = (req as any).user;
    const { conversationId } = req.query;

    let boards;
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

      boards = await db
        .select({
          id: canvasBoardsTable.id,
          name: canvasBoardsTable.name,
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
    } else {
      boards = await db
        .select({
          id: canvasBoardsTable.id,
          name: canvasBoardsTable.name,
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
        .orderBy(desc(canvasBoardsTable.updatedAt));
    }

    res.json(boards);
  } catch (e) {
    console.error("[Canvas] Error fetching boards:", e);
    res.status(500).json({ error: "Failed to fetch boards" });
  }
});

router.post("/boards", requireAuth as any, async (req, res) => {
  try {
    const currentUser = (req as any).user;
    const { name, conversationId } = req.body;

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

    if (!(await canAccessBoard(currentUser.id, boardId))) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [board] = await db
      .select({
        id: canvasBoardsTable.id,
        name: canvasBoardsTable.name,
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
    res.json(board);
  } catch (e) {
    console.error("[Canvas] Error fetching board:", e);
    res.status(500).json({ error: "Failed to fetch board" });
  }
});

router.patch("/boards/:id", requireAuth as any, async (req, res) => {
  try {
    const currentUser = (req as any).user;
    const boardId = parseInt(req.params.id);
    const { name } = req.body;

    const [existing] = await db.select({ createdById: canvasBoardsTable.createdById })
      .from(canvasBoardsTable).where(eq(canvasBoardsTable.id, boardId));
    if (!existing) return res.status(404).json({ error: "Board not found" });
    if (existing.createdById !== currentUser.id) return res.status(403).json({ error: "Only board creator can rename" });

    const [board] = await db
      .update(canvasBoardsTable)
      .set({ name, updatedAt: new Date() })
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

    const [existing] = await db.select({ createdById: canvasBoardsTable.createdById })
      .from(canvasBoardsTable).where(eq(canvasBoardsTable.id, boardId));
    if (!existing) return res.status(404).json({ error: "Board not found" });
    if (existing.createdById !== currentUser.id) return res.status(403).json({ error: "Only board creator can delete" });

    await db.delete(canvasBoardsTable).where(eq(canvasBoardsTable.id, boardId));
    res.json({ success: true });
  } catch (e) {
    console.error("[Canvas] Error deleting board:", e);
    res.status(500).json({ error: "Failed to delete board" });
  }
});

router.get("/boards/:id/elements", requireAuth as any, async (req, res) => {
  try {
    const currentUser = (req as any).user;
    const boardId = parseInt(req.params.id);

    if (!(await canAccessBoard(currentUser.id, boardId))) {
      return res.status(403).json({ error: "Access denied" });
    }

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

    if (!(await canAccessBoard(currentUser.id, boardId))) {
      return res.status(403).json({ error: "Access denied" });
    }

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

    if (!(await canAccessBoard(currentUser.id, boardId))) {
      return res.status(403).json({ error: "Access denied" });
    }

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

    if (!(await canAccessBoard(currentUser.id, boardId))) {
      return res.status(403).json({ error: "Access denied" });
    }

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

    if (!(await canAccessBoard(currentUser.id, boardId))) {
      return res.status(403).json({ error: "Access denied" });
    }

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
