import { db, sessionsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export function generateToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

export async function createSession(userId: number): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(sessionsTable).values({ userId, token, expiresAt });
  return token;
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
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
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
