import { db, auditLogsTable, loginAttemptsTable, messagesTable, cicoStatusTable, conversationsTable } from "@workspace/db";
import { lt, and, eq } from "drizzle-orm";

export interface RetentionPolicy {
  auditLogs: number; // days
  loginAttempts: number; // days
  deletedMessages: number; // days (soft-deleted messages)
  cicoRecords: number; // days
}

const DEFAULT_RETENTION: RetentionPolicy = {
  auditLogs: 90, // Keep for 3 months for compliance
  loginAttempts: 30, // Keep for 1 month
  deletedMessages: 7, // Keep soft-deleted messages for 1 week
  cicoRecords: 365, // Keep for 1 year (compliance)
};

export async function deleteOldAuditLogs(days: number = DEFAULT_RETENTION.auditLogs): Promise<number> {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const result = await db.delete(auditLogsTable)
    .where(lt(auditLogsTable.createdAt, cutoffDate));
  
  return result.rowCount || 0;
}

export async function deleteOldLoginAttempts(days: number = DEFAULT_RETENTION.loginAttempts): Promise<number> {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const result = await db.delete(loginAttemptsTable)
    .where(lt(loginAttemptsTable.createdAt, cutoffDate));
  
  return result.rowCount || 0;
}

export async function deleteOldCICORecords(days: number = DEFAULT_RETENTION.cicoRecords): Promise<number> {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  // Get old CICO records to log
  const oldRecords = await db.select({ id: cicoStatusTable.id })
    .from(cicoStatusTable)
    .where(lt(cicoStatusTable.updatedAt, cutoffDate));
  
  const result = await db.delete(cicoStatusTable)
    .where(lt(cicoStatusTable.updatedAt, cutoffDate));
  
  return result.rowCount || 0;
}

export async function runAllRetentionPolicies(policies: Partial<RetentionPolicy> = {}): Promise<RetentionLog> {
  const mergedPolicies = { ...DEFAULT_RETENTION, ...policies };
  
  const log: RetentionLog = {
    timestamp: new Date(),
    policies: mergedPolicies,
    results: {
      auditLogsDeleted: 0,
      loginAttemptsDeleted: 0,
      cicoRecordsDeleted: 0,
    },
  };
  
  try {
    log.results.auditLogsDeleted = await deleteOldAuditLogs(mergedPolicies.auditLogs);
    log.results.loginAttemptsDeleted = await deleteOldLoginAttempts(mergedPolicies.loginAttempts);
    log.results.cicoRecordsDeleted = await deleteOldCICORecords(mergedPolicies.cicoRecords);
    log.success = true;
  } catch (error) {
    log.success = false;
    log.error = error instanceof Error ? error.message : String(error);
  }
  
  return log;
}

export interface RetentionLog {
  timestamp: Date;
  policies: RetentionPolicy;
  results: {
    auditLogsDeleted: number;
    loginAttemptsDeleted: number;
    cicoRecordsDeleted: number;
  };
  success?: boolean;
  error?: string;
}

export function getDefaultRetentionPolicy(): RetentionPolicy {
  return DEFAULT_RETENTION;
}

export function getRetentionSummary(): string {
  return `Data Retention Policy:\n` +
    `• Audit Logs: ${DEFAULT_RETENTION.auditLogs} days\n` +
    `• Login Attempts: ${DEFAULT_RETENTION.loginAttempts} days\n` +
    `• CICO Records: ${DEFAULT_RETENTION.cicoRecords} days\n` +
    `• Deleted Messages: ${DEFAULT_RETENTION.deletedMessages} days`;
}
