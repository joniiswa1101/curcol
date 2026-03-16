import { db, auditLogsTable } from "@workspace/db";
import type { Request } from "express";

export async function logAudit(params: {
  userId?: number;
  action: string;
  entityType: string;
  entityId?: number;
  details?: Record<string, unknown>;
  req?: Request;
}) {
  try {
    await db.insert(auditLogsTable).values({
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      details: params.details as any,
      ipAddress: params.req?.ip,
      userAgent: params.req?.headers["user-agent"],
    });
  } catch (err) {
    console.error("Failed to log audit:", err);
  }
}
