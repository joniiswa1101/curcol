import { db, loginAttemptsTable, usersTable } from "@workspace/db";
import { eq, and, gt, count } from "drizzle-orm";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;

export async function recordLoginAttempt(userId: number, ipAddress: string, success: boolean) {
  await db.insert(loginAttemptsTable).values({
    userId,
    ipAddress,
    success,
  });
}

export async function getFailedAttemptsCount(userId: number): Promise<number> {
  const cutoffTime = new Date(Date.now() - LOCKOUT_DURATION_MINUTES * 60 * 1000);
  
  const [result] = await db
    .select({ count: count() })
    .from(loginAttemptsTable)
    .where(
      and(
        eq(loginAttemptsTable.userId, userId),
        eq(loginAttemptsTable.success, false),
        gt(loginAttemptsTable.createdAt, cutoffTime)
      )
    );

  return result?.count || 0;
}

export async function isUserLockedOut(userId: number): Promise<boolean> {
  const failedCount = await getFailedAttemptsCount(userId);
  return failedCount >= MAX_FAILED_ATTEMPTS;
}

export async function resetFailedAttempts(userId: number) {
  const cutoffTime = new Date(Date.now() - LOCKOUT_DURATION_MINUTES * 60 * 1000);
  
  await db
    .delete(loginAttemptsTable)
    .where(
      and(
        eq(loginAttemptsTable.userId, userId),
        gt(loginAttemptsTable.createdAt, cutoffTime)
      )
    );
}

export async function cleanupOldLoginAttempts() {
  const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
  
  await db
    .delete(loginAttemptsTable)
    .where(gt(loginAttemptsTable.createdAt, cutoffTime));
}

export async function unlockUserByAdmin(userId: number) {
  await db
    .delete(loginAttemptsTable)
    .where(eq(loginAttemptsTable.userId, userId));
}

export function getMaxFailedAttempts(): number {
  return MAX_FAILED_ATTEMPTS;
}

export function getLockoutDurationMinutes(): number {
  return LOCKOUT_DURATION_MINUTES;
}
