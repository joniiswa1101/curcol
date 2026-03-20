/**
 * Backup Scheduler - Runs scheduled backups using node-cron
 * Default: Every day at 2 AM
 */

import cron from "node-cron";
import { createBackup, BackupResult } from "./backup.js";

interface SchedulerConfig {
  cronExpression?: string;
  enabled?: boolean;
}

const DEFAULT_CRON = "0 2 * * *"; // Every day at 2:00 AM

let scheduledTask: cron.ScheduledTask | null = null;

export function initBackupScheduler(config?: SchedulerConfig): {
  status: string;
  schedule: string;
} {
  const cronExpression = config?.cronExpression || DEFAULT_CRON;
  const enabled = config?.enabled !== false;

  if (!enabled) {
    console.log("ℹ️  Backup scheduler disabled");
    return { status: "disabled", schedule: cronExpression };
  }

  try {
    // Stop existing task if running
    if (scheduledTask) {
      scheduledTask.stop();
    }

    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    // Schedule backup task
    scheduledTask = cron.schedule(cronExpression, async () => {
      console.log(`🔄 Running scheduled database backup...`);
      const result = await createBackup();
      if (result.success) {
        console.log(`✅ Scheduled backup complete: ${result.filename}`);
      } else {
        console.error(`❌ Scheduled backup failed: ${result.error}`);
      }
    });

    const nextDate = scheduledTask.nextDate().toISOString();
    console.log(`✅ Backup scheduler initialized`);
    console.log(`   Schedule: ${cronExpression}`);
    console.log(`   Next backup: ${nextDate}`);

    return {
      status: "running",
      schedule: cronExpression,
    };
  } catch (error) {
    console.error("❌ Failed to initialize backup scheduler:", error);
    return {
      status: "error",
      schedule: cronExpression,
    };
  }
}

export function stopBackupScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log("Backup scheduler stopped");
  }
}

export function getSchedulerStatus(): {
  running: boolean;
  nextDate?: string;
} {
  if (!scheduledTask) {
    return { running: false };
  }

  return {
    running: true,
    nextDate: scheduledTask.nextDate().toISOString(),
  };
}
