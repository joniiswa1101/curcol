import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { getOnlineUserIds } from "../lib/websocket.js";

const router = Router();

router.get("/", requireAuth as any, async (_req, res) => {
  const onlineIds = getOnlineUserIds();
  
  const presenceRows = await db.execute(sql`
    SELECT user_id, status, last_seen_at, updated_at 
    FROM user_presence 
    ORDER BY updated_at DESC
  `);
  
  const presenceMap: Record<number, any> = {};
  for (const row of presenceRows.rows as any[]) {
    presenceMap[row.user_id] = {
      userId: row.user_id,
      status: onlineIds.includes(row.user_id) ? "online" : row.status,
      lastSeenAt: row.last_seen_at,
      updatedAt: row.updated_at,
    };
  }
  
  for (const id of onlineIds) {
    if (!presenceMap[id]) {
      presenceMap[id] = {
        userId: id,
        status: "online",
        lastSeenAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
  }
  
  res.json({ presence: presenceMap });
});

router.get("/:userId", requireAuth as any, async (req, res) => {
  const userId = Number(req.params.userId);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }
  const onlineIds = getOnlineUserIds();
  
  const rows = await db.execute(sql`
    SELECT user_id, status, last_seen_at, updated_at 
    FROM user_presence 
    WHERE user_id = ${userId}
  `);
  
  if (rows.rows.length === 0) {
    res.json({
      presence: {
        userId,
        status: onlineIds.includes(userId) ? "online" : "offline",
        lastSeenAt: null,
        updatedAt: null,
      },
    });
    return;
  }
  
  const row = rows.rows[0] as any;
  res.json({
    presence: {
      userId: row.user_id,
      status: onlineIds.includes(userId) ? "online" : row.status,
      lastSeenAt: row.last_seen_at,
      updatedAt: row.updated_at,
    },
  });
});

export default router;
