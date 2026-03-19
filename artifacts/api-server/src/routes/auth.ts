import { Router } from "express";
import { db, usersTable, sessionsTable, cicoStatusTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { createSession, refreshSession, requireAuth } from "../lib/auth.js";
import { verifyPassword, hashPassword } from "../lib/password.js";
import { validatePasswordComplexity, getPasswordRequirements } from "../lib/password-rules.js";
import { logAudit } from "../lib/audit.js";
import { loginWithCICO } from "../lib/cico.js";
import { generateTOTPSecret, getTOTPUri, generateQRCodeDataURL, verifyTOTPToken } from "../lib/totp.js";
import { is2FASystemEnabled, getSetting, setSetting } from "../lib/settings.js";

const router = Router();

function buildTokenResponse(tokenPair: { token: string; refreshToken: string; expiresAt: Date; refreshExpiresAt: Date }) {
  return {
    token: tokenPair.token,
    refreshToken: tokenPair.refreshToken,
    expiresAt: tokenPair.expiresAt.toISOString(),
    refreshExpiresAt: tokenPair.refreshExpiresAt.toISOString(),
  };
}

async function buildUserResponse(user: any) {
  const cicoRecord = await db.select().from(cicoStatusTable).where(eq(cicoStatusTable.employeeId, user.employeeId));
  return {
    ...user,
    password: undefined,
    twoFactorSecret: undefined,
    cicoStatus: cicoRecord[0] || null,
  };
}

router.post("/sso/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "bad_request", message: "Username dan password wajib diisi" });
    return;
  }

  try {
    const cicoData = await loginWithCICO(username, password);

    let [user] = await db.select().from(usersTable).where(
      or(
        eq(usersTable.email, cicoData.user.email),
        eq(usersTable.employeeId, cicoData.user.id)
      )
    );

    if (!user) {
      const [newUser] = await db.insert(usersTable).values({
        employeeId: cicoData.user.id,
        name: cicoData.user.fullName,
        email: cicoData.user.email,
        password: hashPassword(cicoData.user.id),
        department: cicoData.user.department,
        role: cicoData.user.role === "admin" ? "admin" : cicoData.user.role === "manager" ? "manager" : "employee",
        isActive: true,
      }).returning();
      user = newUser;
    }

    const systemEnabled = await is2FASystemEnabled();
    if (systemEnabled && user.twoFactorEnabled) {
      if (!user.twoFactorSecret) {
        await db.update(usersTable).set({ twoFactorEnabled: false }).where(eq(usersTable.id, user.id));
        const tokenPair = await createSession(user.id);
        await logAudit({ userId: user.id, action: "2fa_auto_reset_missing_secret", entityType: "session", req });
        res.json({ ...buildTokenResponse(tokenPair), user: await buildUserResponse(user) });
        return;
      }
      const { totpCode } = req.body;
      if (!totpCode) {
        res.status(200).json({
          requiresTwoFactor: true,
          employeeId: user.employeeId,
          message: "Masukkan kode 2FA dari aplikasi authenticator",
        });
        return;
      }
      if (!verifyTOTPToken(user.twoFactorSecret!, totpCode, user.employeeId)) {
        await logAudit({ userId: user.id, action: "login_failed_2fa", entityType: "session", req });
        res.status(401).json({ error: "invalid_2fa", message: "Kode 2FA tidak valid" });
        return;
      }
    }

    const tokenPair = await createSession(user.id);
    await logAudit({ userId: user.id, action: "login_via_cico", entityType: "session", req });

    res.json({
      ...buildTokenResponse(tokenPair),
      user: await buildUserResponse(user),
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

router.post("/login", async (req, res) => {
  const { employeeId, password, totpCode } = req.body;
  if (!employeeId || !password) {
    res.status(400).json({ error: "bad_request", message: "Employee ID/email dan password wajib diisi" });
    return;
  }

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

  const systemEnabled = await is2FASystemEnabled();
  if (systemEnabled && user.twoFactorEnabled) {
    if (!user.twoFactorSecret) {
      await db.update(usersTable).set({ twoFactorEnabled: false }).where(eq(usersTable.id, user.id));
      const tokenPair = await createSession(user.id);
      await logAudit({ userId: user.id, action: "2fa_auto_reset_missing_secret", entityType: "session", req });
      res.json({ user: await buildUserResponse(user), ...buildTokenResponse(tokenPair) });
      return;
    }
    if (!totpCode) {
      res.status(200).json({
        requiresTwoFactor: true,
        employeeId: user.employeeId,
        message: "Masukkan kode 2FA dari aplikasi authenticator",
      });
      return;
    }
    if (!verifyTOTPToken(user.twoFactorSecret!, totpCode, user.employeeId)) {
      await logAudit({ userId: user.id, action: "login_failed_2fa", entityType: "session", req });
      res.status(401).json({ error: "invalid_2fa", message: "Kode 2FA tidak valid" });
      return;
    }
  }

  const tokenPair = await createSession(user.id);
  await logAudit({ userId: user.id, action: "login", entityType: "session", req });

  res.json({
    user: await buildUserResponse(user),
    ...buildTokenResponse(tokenPair),
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

router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({ error: "bad_request", message: "Refresh token wajib diisi" });
    return;
  }

  const tokenPair = await refreshSession(refreshToken);
  if (!tokenPair) {
    res.status(401).json({ error: "unauthorized", message: "Refresh token tidak valid atau sudah expired. Silakan login ulang." });
    return;
  }

  res.json(buildTokenResponse(tokenPair));
});

router.get("/me", requireAuth as any, async (req, res) => {
  const user = (req as any).user;
  const systemEnabled = await is2FASystemEnabled();
  const response = await buildUserResponse(user);
  res.json({
    ...response,
    twoFactorEnabled: user.twoFactorEnabled,
    twoFactorSystemEnabled: systemEnabled,
  });
});

router.post("/change-password", requireAuth as any, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = (req as any).user;

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "bad_request", message: "Password lama dan baru wajib diisi" });
    return;
  }

  const complexity = validatePasswordComplexity(newPassword);
  if (!complexity.valid) {
    res.status(400).json({
      error: "bad_request",
      message: "Password tidak memenuhi persyaratan keamanan",
      requirements: getPasswordRequirements(),
      errors: complexity.errors,
    });
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

router.post("/2fa/setup", requireAuth as any, async (req, res) => {
  const user = (req as any).user;

  const systemEnabled = await is2FASystemEnabled();
  if (!systemEnabled) {
    res.status(400).json({ error: "2fa_disabled", message: "2FA belum diaktifkan oleh administrator sistem" });
    return;
  }

  if (user.twoFactorEnabled) {
    res.status(400).json({ error: "already_enabled", message: "2FA sudah aktif di akun ini" });
    return;
  }

  const secret = generateTOTPSecret();
  const uri = getTOTPUri(secret, user.employeeId);
  const qrCode = await generateQRCodeDataURL(uri);

  await db.update(usersTable)
    .set({ twoFactorSecret: secret })
    .where(eq(usersTable.id, user.id));

  await logAudit({ userId: user.id, action: "2fa_setup_started", entityType: "user", req });

  res.json({
    secret,
    qrCode,
    uri,
    message: "Scan QR code dengan Google Authenticator atau Authy, lalu verifikasi dengan kode 6 digit",
  });
});

router.post("/2fa/verify", requireAuth as any, async (req, res) => {
  const user = (req as any).user;
  const { token } = req.body;

  if (!token) {
    res.status(400).json({ error: "bad_request", message: "Kode 2FA wajib diisi" });
    return;
  }

  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  if (!dbUser || !dbUser.twoFactorSecret) {
    res.status(400).json({ error: "not_setup", message: "2FA belum di-setup. Panggil /2fa/setup terlebih dahulu" });
    return;
  }

  if (!verifyTOTPToken(dbUser.twoFactorSecret, token, dbUser.employeeId)) {
    res.status(400).json({ error: "invalid_token", message: "Kode 2FA tidak valid. Pastikan waktu perangkat Anda sinkron." });
    return;
  }

  await db.update(usersTable)
    .set({ twoFactorEnabled: true })
    .where(eq(usersTable.id, user.id));

  await logAudit({ userId: user.id, action: "2fa_enabled", entityType: "user", req });

  res.json({ success: true, message: "2FA berhasil diaktifkan! Mulai sekarang login memerlukan kode dari authenticator." });
});

router.post("/2fa/disable", requireAuth as any, async (req, res) => {
  const user = (req as any).user;
  const { password } = req.body;

  if (!password) {
    res.status(400).json({ error: "bad_request", message: "Password wajib diisi untuk menonaktifkan 2FA" });
    return;
  }

  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  if (!dbUser) {
    res.status(404).json({ error: "not_found", message: "User tidak ditemukan" });
    return;
  }

  if (!verifyPassword(password, dbUser.password)) {
    res.status(401).json({ error: "unauthorized", message: "Password tidak sesuai" });
    return;
  }

  await db.update(usersTable)
    .set({ twoFactorEnabled: false, twoFactorSecret: null })
    .where(eq(usersTable.id, user.id));

  await logAudit({ userId: user.id, action: "2fa_disabled", entityType: "user", req });

  res.json({ success: true, message: "2FA berhasil dinonaktifkan" });
});

router.get("/2fa/status", requireAuth as any, async (req, res) => {
  const user = (req as any).user;
  const systemEnabled = await is2FASystemEnabled();

  res.json({
    systemEnabled,
    userEnabled: user.twoFactorEnabled,
    hasSecret: !!user.twoFactorSecret,
  });
});

router.post("/2fa/system-toggle", requireAuth as any, async (req, res) => {
  const user = (req as any).user;

  if (user.role !== "admin") {
    res.status(403).json({ error: "forbidden", message: "Hanya admin yang dapat mengubah setting 2FA sistem" });
    return;
  }

  const { enabled } = req.body;
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "bad_request", message: "Parameter 'enabled' (boolean) wajib diisi" });
    return;
  }

  await setSetting("2fa_enabled", String(enabled));
  await logAudit({
    userId: user.id,
    action: enabled ? "2fa_system_enabled" : "2fa_system_disabled",
    entityType: "system",
    req,
  });

  res.json({
    success: true,
    enabled,
    message: enabled
      ? "2FA sistem diaktifkan. Karyawan sekarang dapat mengaktifkan 2FA di akun masing-masing."
      : "2FA sistem dinonaktifkan. Semua karyawan tidak perlu 2FA saat login.",
  });
});

router.post("/2fa/admin-reset", requireAuth as any, async (req, res) => {
  const requestingUser = (req as any).user;

  if (requestingUser.role !== "admin") {
    res.status(403).json({ error: "forbidden", message: "Hanya admin yang dapat mereset 2FA karyawan" });
    return;
  }

  const { targetEmployeeId } = req.body;
  if (!targetEmployeeId) {
    res.status(400).json({ error: "bad_request", message: "targetEmployeeId wajib diisi" });
    return;
  }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.employeeId, targetEmployeeId));
  if (!target) {
    res.status(404).json({ error: "not_found", message: "Karyawan tidak ditemukan" });
    return;
  }

  await db.update(usersTable)
    .set({ twoFactorEnabled: false, twoFactorSecret: null })
    .where(eq(usersTable.id, target.id));

  await logAudit({
    userId: requestingUser.id,
    action: "2fa_admin_reset",
    entityType: "user",
    entityId: target.id,
    details: { targetEmployeeId } as any,
    req,
  });

  res.json({ success: true, message: `2FA untuk ${targetEmployeeId} berhasil direset` });
});

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
