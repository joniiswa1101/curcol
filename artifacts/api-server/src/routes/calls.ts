import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

router.get("/", requireAuth as any, async (req, res) => {
  const currentUser = (req as any).user;
  
  const calls = await db.execute(sql`
    SELECT c.*, 
      caller.display_name as caller_name, caller.avatar_url as caller_avatar,
      receiver.display_name as receiver_name, receiver.avatar_url as receiver_avatar
    FROM calls c
    JOIN users caller ON c.caller_id = caller.id
    JOIN users receiver ON c.receiver_id = receiver.id
    WHERE c.caller_id = ${currentUser.id} OR c.receiver_id = ${currentUser.id}
    ORDER BY c.started_at DESC
    LIMIT 50
  `);
  
  res.json({ calls: calls.rows });
});

router.post("/:callId/end", requireAuth as any, async (req, res) => {
  const { callId } = req.params;
  const { reason } = req.body;
  
  await db.execute(sql`
    UPDATE calls 
    SET status = 'ended', ended_at = NOW(), end_reason = ${reason || 'hangup'},
        duration = EXTRACT(EPOCH FROM (NOW() - COALESCE(answered_at, started_at)))::integer
    WHERE id = ${Number(callId)}
  `);
  
  res.json({ success: true });
});

export default router;
