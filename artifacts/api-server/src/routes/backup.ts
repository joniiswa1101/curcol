/**
 * Database Backup Management Routes
 * Admin-only endpoints for manual backups and restore
 */

import { Router, Request, Response, NextFunction } from "express";
import { requireAdmin } from "../lib/auth.js";
import { createBackup, listBackups, restoreBackup, getBackupHealth } from "../lib/backup.js";

const router = Router();

/**
 * GET /api/backup/health
 * Check backup system health
 */
router.get("/health", async (req, res) => {
  try {
    const health = await getBackupHealth();
    res.json(health);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/backup/list
 * List all available backups (admin only)
 */
router.get("/list", requireAdmin as any, async (req, res) => {
  try {
    const backups = await listBackups();
    res.json({
      count: backups.length,
      backups: backups.map((b) => ({
        filename: b.filename,
        size: `${(b.size / 1024 / 1024).toFixed(2)}MB`,
        timestamp: b.timestamp,
        canRestore: true,
      })),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /api/backup/create
 * Create manual backup (admin only)
 */
router.post("/create", requireAdmin as any, async (req, res) => {
  try {
    const result = await createBackup();

    if (result.success) {
      return res.json({
        success: true,
        filename: result.filename,
        size: `${((result.size || 0) / 1024 / 1024).toFixed(2)}MB`,
        duration: `${result.duration}ms`,
        timestamp: result.timestamp,
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /api/backup/restore
 * Restore from backup (admin only, requires confirmation)
 * WARNING: This will REPLACE the current database!
 */
router.post("/restore", requireAdmin as any, async (req, res) => {
  const { filename, confirm } = req.body;

  if (!filename) {
    return res.status(400).json({ error: "filename required" });
  }

  if (!confirm) {
    return res.status(400).json({
      error: "Restore is destructive. Set confirm: true to proceed",
      warning: "This will REPLACE all current data with backup data",
    });
  }

  try {
    const result = await restoreBackup(filename);

    if (result.success) {
      return res.json({
        success: true,
        message: `Database restored from ${filename}`,
        timestamp: new Date(),
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/backup/scheduler-status
 * Check scheduled backup status
 */
router.get("/scheduler-status", async (req, res) => {
  try {
    // This will be populated by the scheduler on startup
    const status = (globalThis as any).__backupSchedulerStatus || {
      running: false,
      nextDate: null,
    };

    res.json(status);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
