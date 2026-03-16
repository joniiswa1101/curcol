import { Router } from "express";
import { db, cicoStatusTable, cicoLogsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { logAudit } from "../lib/audit.js";
import { broadcastToAll } from "../lib/websocket.js";

const router = Router();

router.get("/status", requireAuth as any, async (_req, res) => {
  const statuses = await db.select().from(cicoStatusTable);
  res.json({ statuses });
});

router.get("/status/:employeeId", requireAuth as any, async (req, res) => {
  const { employeeId } = req.params;
  const [status] = await db.select().from(cicoStatusTable).where(eq(cicoStatusTable.employeeId, employeeId));
  if (!status) {
    const absent = {
      employeeId,
      status: "absent" as const,
      checkInTime: null,
      checkOutTime: null,
      location: null,
      updatedAt: new Date(),
    };
    res.json(absent);
    return;
  }
  res.json(status);
});

router.post("/checkin", requireAuth as any, async (req, res) => {
  const { employeeId, location, type } = req.body;
  const user = (req as any).user;
  const now = new Date();
  const statusVal = type === "wfh" ? "wfh" : "present";

  const existing = await db.select().from(cicoStatusTable).where(eq(cicoStatusTable.employeeId, employeeId));
  if (existing.length > 0) {
    const [updated] = await db.update(cicoStatusTable).set({
      status: statusVal,
      checkInTime: now,
      checkOutTime: null,
      location: location || (type === "wfh" ? "WFH" : "Office"),
      updatedAt: now,
    }).where(eq(cicoStatusTable.employeeId, employeeId)).returning();
    await db.insert(cicoLogsTable).values({ employeeId, action: "checkin", location, type });
    await logAudit({ userId: user.id, action: "cico_checkin", entityType: "cico", req });
    broadcastToAll({ type: "cico_update", data: updated });
    res.json(updated);
  } else {
    const [created] = await db.insert(cicoStatusTable).values({
      employeeId,
      status: statusVal,
      checkInTime: now,
      location: location || (type === "wfh" ? "WFH" : "Office"),
      updatedAt: now,
    }).returning();
    await db.insert(cicoLogsTable).values({ employeeId, action: "checkin", location, type });
    await logAudit({ userId: user.id, action: "cico_checkin", entityType: "cico", req });
    broadcastToAll({ type: "cico_update", data: created });
    res.json(created);
  }
});

router.post("/checkout", requireAuth as any, async (req, res) => {
  const { employeeId } = req.body;
  const user = (req as any).user;
  const now = new Date();

  const [updated] = await db.update(cicoStatusTable).set({
    status: "absent",
    checkOutTime: now,
    updatedAt: now,
  }).where(eq(cicoStatusTable.employeeId, employeeId)).returning();

  await db.insert(cicoLogsTable).values({ employeeId, action: "checkout" });
  await logAudit({ userId: user.id, action: "cico_checkout", entityType: "cico", req });
  broadcastToAll({ type: "cico_update", data: updated });
  res.json(updated);
});

export default router;
