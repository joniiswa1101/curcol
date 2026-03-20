import { db, sessionsTable, usersTable } from "@workspace/db";
import { eq, lt } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

const ACCESS_TOKEN_TTL = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000;

export function generateToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

export interface TokenPair {
  token: string;
  refreshToken: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
}

export async function createSession(userId: number): Promise<TokenPair> {
  const token = generateToken();
  const refreshToken = generateToken();
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL);

  await db.insert(sessionsTable).values({
    userId,
    token,
    refreshToken,
    expiresAt,
    refreshExpiresAt,
  });

  return { token, refreshToken, expiresAt, refreshExpiresAt };
}

export async function refreshSession(oldRefreshToken: string): Promise<TokenPair | null> {
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.refreshToken, oldRefreshToken));

  if (!session) return null;
  if (session.refreshExpiresAt && session.refreshExpiresAt < new Date()) {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, session.id));
    return null;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, session.userId));

  if (!user || !user.isActive) {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, session.id));
    return null;
  }

  const newToken = generateToken();
  const newRefreshToken = generateToken();
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL);

  await db.delete(sessionsTable).where(eq(sessionsTable.id, session.id));

  await db.insert(sessionsTable).values({
    userId: session.userId,
    token: newToken,
    refreshToken: newRefreshToken,
    expiresAt,
    refreshExpiresAt,
  });

  return { token: newToken, refreshToken: newRefreshToken, expiresAt, refreshExpiresAt };
}

export async function getUserFromToken(token: string) {
  if (!token) return null;
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.token, token));
  if (!session || session.expiresAt < new Date()) return null;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, session.userId));
  return user || null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const queryToken = req.query?.token as string | undefined;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : queryToken || null;
  if (!token) {
    res.status(401).json({ error: "unauthorized", message: "No token provided" });
    return;
  }
  const user = await getUserFromToken(token);
  if (!user || !user.isActive) {
    res.status(401).json({ error: "unauthorized", message: "Invalid or expired token" });
    return;
  }
  (req as any).user = user;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, async () => {
    const user = (req as any).user;
    if (user?.role !== "admin") {
      res.status(403).json({ error: "forbidden", message: "Admin access required" });
      return;
    }
    next();
  });
}

export async function requireAdminOrManager(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, async () => {
    const user = (req as any).user;
    if (user?.role !== "admin" && user?.role !== "manager") {
      res.status(403).json({ error: "forbidden", message: "Manager or admin access required" });
      return;
    }
    next();
  });
}

export async function cleanExpiredSessions(): Promise<number> {
  const result = await db
    .delete(sessionsTable)
    .where(lt(sessionsTable.expiresAt, new Date()))
    .returning();
  return result.length;
}
