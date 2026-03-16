import { Router } from "express";
import { db, usersTable, sessionsTable, cicoStatusTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { createSession, requireAuth } from "../lib/auth.js";
import { verifyPassword, hashPassword } from "../lib/password.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

/**
 * SSO dengan CICO:
 * Password CurCol disinkronkan dengan PIN/password sistem CICO karyawan.
 * Password awal = Employee ID (misalnya EMP001 → password: EMP001).
 * Admin dapat mereset password via endpoint /auth/reset-password.
 */
router.post("/login", async (req, res) => {
  const { employeeId, password } = req.body;
  if (!employeeId || !password) {
    res.status(400).json({ error: "bad_request", message: "Employee ID/email dan password wajib diisi" });
    return;
  }

  // Support login dengan Employee ID (EMP001) ATAU email (joni@rpk.com)
  const [user] = await db.select().from(usersTable).where(
    or(
      eq(usersTable.employeeId, employeeId),
      eq(usersTable.email, employeeId.toLowerCase())
    )
  );

  if (!user) {
    res.status(401).json({ error: "unauthorized", message: "Employee ID atau password salah" });
    return;
  }

  if (!user.isActive) {
    res.status(401).json({ error: "unauthorized", message: "Akun tidak aktif. Hubungi administrator." });
    return;
  }

  if (!verifyPassword(password, user.password)) {
    await logAudit({ userId: user.id, action: "login_failed", entityType: "session", req });
    res.status(401).json({ error: "unauthorized", message: "Employee ID atau password salah" });
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

/**
 * Ganti password (SSO sync).
 * Karyawan dapat mengganti password yang disinkronkan dengan CICO.
 */
router.post("/change-password", requireAuth as any, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = (req as any).user;

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "bad_request", message: "Password lama dan baru wajib diisi" });
    return;
  }

  if (newPassword.length < 6) {
    res.status(400).json({ error: "bad_request", message: "Password baru minimal 6 karakter" });
    return;
  }

  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  if (!verifyPassword(currentPassword, dbUser.password)) {
    res.status(401).json({ error: "unauthorized", message: "Password lama tidak sesuai" });
    return;
  }

  await db.update(usersTable)
    .set({ password: hashPassword(newPassword) })
    .where(eq(usersTable.id, user.id));

  await logAudit({ userId: user.id, action: "change_password", entityType: "user", req });
  res.json({ success: true, message: "Password berhasil diperbarui" });
});

/**
 * Reset password ke default (= Employee ID) — hanya admin.
 */
router.post("/reset-password", requireAuth as any, async (req, res) => {
  const { targetEmployeeId } = req.body;
  const requestingUser = (req as any).user;

  if (requestingUser.role !== "admin") {
    res.status(403).json({ error: "forbidden", message: "Hanya admin yang dapat mereset password" });
    return;
  }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.employeeId, targetEmployeeId));
  if (!target) {
    res.status(404).json({ error: "not_found", message: "Karyawan tidak ditemukan" });
    return;
  }

  await db.update(usersTable)
    .set({ password: hashPassword(targetEmployeeId) })
    .where(eq(usersTable.employeeId, targetEmployeeId));

  await logAudit({ userId: requestingUser.id, action: "reset_password", entityType: "user", entityId: target.id, req });
  res.json({ success: true, message: `Password ${targetEmployeeId} berhasil direset ke Employee ID` });
});

export default router;
