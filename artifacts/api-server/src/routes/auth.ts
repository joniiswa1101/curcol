import { Router } from "express";
import { db, usersTable, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createSession, requireAuth } from "../lib/auth.js";
import { verifyPassword } from "../lib/password.js";
import { logAudit } from "../lib/audit.js";
import { cicoStatusTable } from "@workspace/db";

const router = Router();

router.post("/login", async (req, res) => {
  const { employeeId, password } = req.body;
  if (!employeeId || !password) {
    res.status(400).json({ error: "bad_request", message: "employeeId and password required" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.employeeId, employeeId));
  if (!user || !verifyPassword(password, user.password)) {
    res.status(401).json({ error: "unauthorized", message: "Invalid credentials" });
    return;
  }
  if (!user.isActive) {
    res.status(401).json({ error: "unauthorized", message: "Account deactivated" });
    return;
  }
  const token = await createSession(user.id);
  await logAudit({ userId: user.id, action: "login", entityType: "session", req });
  const cicoRecord = await db.select().from(cicoStatusTable).where(eq(cicoStatusTable.employeeId, user.employeeId));
  res.json({
    user: {
      ...user,
      password: undefined,
      cicoStatus: cicoRecord[0] || null,
    },
    token,
  });
});

router.post("/logout", requireAuth as any, async (req, res) => {
  const token = req.headers.authorization?.slice(7);
  if (token) {
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
  }
  const user = (req as any).user;
  await logAudit({ userId: user?.id, action: "logout", entityType: "session", req });
  res.json({ success: true, message: "Logged out" });
});

router.get("/me", requireAuth as any, async (req, res) => {
  const user = (req as any).user;
  const cicoRecord = await db.select().from(cicoStatusTable).where(eq(cicoStatusTable.employeeId, user.employeeId));
  res.json({ ...user, password: undefined, cicoStatus: cicoRecord[0] || null });
});

export default router;
