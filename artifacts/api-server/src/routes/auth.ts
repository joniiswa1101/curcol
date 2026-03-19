import { Router } from "express";
import { db, usersTable, sessionsTable, cicoStatusTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { createSession, requireAuth } from "../lib/auth.js";
import { verifyPassword, hashPassword } from "../lib/password.js";
import { logAudit } from "../lib/audit.js";
import { loginWithCICO } from "../lib/cico.js";

const router = Router();

/**
 * SSO Login via CICO
 */
router.post("/sso/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "bad_request", message: "Username dan password wajib diisi" });
    return;
  }

  try {
    // Call CICO SSO endpoint
    const cicoData = await loginWithCICO(username, password);

    // Cari atau buat user di CurCol dari data CICO
    let [user] = await db.select().from(usersTable).where(
      or(
        eq(usersTable.email, cicoData.user.email),
        eq(usersTable.employeeId, cicoData.user.id)
      )
    );

    if (!user) {
      // Auto-create user dari CICO data
      const [newUser] = await db.insert(usersTable).values({
        employeeId: cicoData.user.id,
        name: cicoData.user.fullName,
        email: cicoData.user.email,
        password: hashPassword(cicoData.user.id), // Set dummy password (auth via CICO)
        department: cicoData.user.department,
        role: cicoData.user.role === "admin" ? "admin" : cicoData.user.role === "manager" ? "manager" : "employee",
        isActive: true,
      }).returning();
      user = newUser;
    }

    // Create CurCol session
    const token = await createSession(user.id);
    await logAudit({ userId: user.id, action: "login_via_cico", entityType: "session", req });

    const cicoRecord = await db.select().from(cicoStatusTable).where(eq(cicoStatusTable.employeeId, user.employeeId));

    res.json({
      token,
      user: {
        ...user,
        password: undefined,
        cicoStatus: cicoRecord[0] || null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "CICO login failed";
    await logAudit({
      userId: null,
      action: "login_failed_cico",
      entityType: "session",
      details: { error: message } as any,
      req,
    });
    res.status(401).json({ error: "unauthorized", message });
  }
});

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
  if (!dbUser) {
    res.status(404).json({ error: "not_found", message: "User tidak ditemukan" });
    return;
  }
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

/**
 * Test CICO connectivity (diagnostic endpoint)
 */
router.get("/test-cico-health", async (req, res) => {
  try {
    const response = await fetch("https://workspace.joniiswa1101.repl.co/api/auth/sso/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "test-health-check", password: "test" }),
    });
    
    const data = await response.json();
    res.json({
      status: "connected",
      cicoUrl: "https://workspace.joniiswa1101.repl.co",
      httpStatus: response.status,
      responsePreview: typeof data === 'object' ? { ...data, token: data.token ? '[JWT]' : undefined } : data,
    });
  } catch (err) {
    res.status(503).json({
      status: "disconnected",
      error: err instanceof Error ? err.message : "Unknown error",
      cicoUrl: "https://workspace.joniiswa1101.repl.co",
      message: "Cannot reach CICO. Check URL and network connectivity.",
    });
  }
});

export default router;
