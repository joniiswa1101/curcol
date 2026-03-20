/**
 * Database Backup Service
 * Scheduled backups using pg_dump with compression
 */

import { exec } from "child_process";
import { promisify } from "util";
import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const execAsync = promisify(exec);

interface BackupConfig {
  backupDir?: string;
  maxBackups?: number;
  compression?: "gzip" | "none";
}

const DEFAULT_CONFIG: Required<BackupConfig> = {
  backupDir: "./backups",
  maxBackups: 30, // Keep last 30 backups
  compression: "gzip",
};

export interface BackupResult {
  success: boolean;
  filename: string;
  timestamp: Date;
  size?: number;
  duration?: number;
  error?: string;
}

/**
 * Create database backup using pg_dump
 */
export async function createBackup(config?: BackupConfig): Promise<BackupResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();

  try {
    // Ensure backup directory exists
    if (!existsSync(cfg.backupDir)) {
      await mkdir(cfg.backupDir, { recursive: true });
    }

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const ext = cfg.compression === "gzip" ? ".sql.gz" : ".sql";
    const filename = `backup-${timestamp}${ext}`;
    const filepath = path.join(cfg.backupDir, filename);

    // Build pg_dump command
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error("DATABASE_URL environment variable not set");
    }

    const pgDumpCmd = `pg_dump "${dbUrl}" ${
      cfg.compression === "gzip" ? "| gzip" : ""
    } > "${filepath}"`;

    // Execute backup
    await execAsync(pgDumpCmd, { shell: "/bin/bash" });

    // Get file size (stats)
    const stats = require("fs").statSync(filepath);
    const duration = Date.now() - startTime;

    console.log(
      `✅ Backup created: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)}MB) in ${duration}ms`
    );

    // Cleanup old backups
    await cleanupOldBackups(cfg.backupDir, cfg.maxBackups);

    return {
      success: true,
      filename,
      timestamp: new Date(),
      size: stats.size,
      duration,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("❌ Backup failed:", errorMsg);

    return {
      success: false,
      filename: "",
      timestamp: new Date(),
      error: errorMsg,
    };
  }
}

/**
 * Get list of existing backups
 */
export async function listBackups(
  backupDir: string = DEFAULT_CONFIG.backupDir
): Promise<Array<{ filename: string; size: number; timestamp: Date }>> {
  try {
    const fs = require("fs").promises;
    const files = await fs.readdir(backupDir);

    const backups = await Promise.all(
      files
        .filter((f: string) => f.startsWith("backup-") && (f.endsWith(".sql") || f.endsWith(".sql.gz")))
        .map(async (filename: string) => {
          const filepath = path.join(backupDir, filename);
          const stats = require("fs").statSync(filepath);
          // Extract timestamp from filename: backup-2024-12-31T23-59-59-999Z.sql.gz
          const timestampStr = filename
            .replace("backup-", "")
            .replace(".sql.gz", "")
            .replace(".sql", "")
            .replace(/-/g, (m: string, i: number) => (i <= 18 ? m : "."));
          const timestamp = new Date(timestampStr.replace(/-([0-9]{3})Z/, ".$1Z"));

          return { filename, size: stats.size, timestamp };
        })
    );

    // Sort by timestamp descending
    return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  } catch {
    return [];
  }
}

/**
 * Restore database from backup
 * WARNING: This will REPLACE the current database!
 */
export async function restoreBackup(
  backupFilename: string,
  backupDir: string = DEFAULT_CONFIG.backupDir
): Promise<{ success: boolean; error?: string }> {
  const filepath = path.join(backupDir, backupFilename);

  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error("DATABASE_URL environment variable not set");
    }

    // Determine if file is gzipped
    const isGzipped = backupFilename.endsWith(".gz");
    const catCmd = isGzipped ? "zcat" : "cat";

    // Restore database
    const restoreCmd = `${catCmd} "${filepath}" | psql "${dbUrl}"`;
    const startTime = Date.now();

    await execAsync(restoreCmd, { shell: "/bin/bash" });

    const duration = Date.now() - startTime;
    console.log(`✅ Restore completed in ${duration}ms from ${backupFilename}`);

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("❌ Restore failed:", errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Delete old backups, keeping only latest N
 */
async function cleanupOldBackups(
  backupDir: string,
  maxBackups: number
): Promise<void> {
  try {
    const backups = await listBackups(backupDir);

    // Keep only latest maxBackups
    const toDelete = backups.slice(maxBackups);

    if (toDelete.length > 0) {
      const fs = require("fs").promises;
      for (const backup of toDelete) {
        const filepath = path.join(backupDir, backup.filename);
        await fs.unlink(filepath);
        console.log(`🗑️  Removed old backup: ${backup.filename}`);
      }
    }
  } catch (error) {
    console.warn("Cleanup warning:", error);
  }
}

/**
 * Health check for backup system
 */
export async function getBackupHealth(): Promise<{
  status: "healthy" | "warning" | "error";
  lastBackup?: { filename: string; timestamp: Date; size: number };
  totalBackups: number;
  error?: string;
}> {
  try {
    const backups = await listBackups();

    if (backups.length === 0) {
      return { status: "error", totalBackups: 0, error: "No backups found" };
    }

    const lastBackup = backups[0];
    const hoursSinceLastBackup = (Date.now() - lastBackup.timestamp.getTime()) / (1000 * 60 * 60);

    return {
      status: hoursSinceLastBackup > 25 ? "warning" : "healthy",
      lastBackup,
      totalBackups: backups.length,
    };
  } catch (error) {
    return {
      status: "error",
      totalBackups: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
