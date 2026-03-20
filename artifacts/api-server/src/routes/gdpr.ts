/**
 * GDPR & Data Export Routes
 * Allow users to export their personal data
 */

import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { exportUserDataAsJSON, exportUserDataAsCSV } from "../lib/gdpr-export.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

/**
 * GET /api/gdpr/export/json
 * Export user's personal data as JSON
 * User can only export their own data
 */
router.get("/export/json", requireAuth as any, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const jsonData = await exportUserDataAsJSON(user.id);

    // Log the export
    await logAudit({
      userId: user.id,
      action: "data_export_json",
      entityType: "user",
      entityId: user.id,
      details: {
        format: "json",
        dataSize: jsonData.length,
      },
      req,
    });

    // Send as JSON response
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="curcol-data-export-${new Date().toISOString().split("T")[0]}.json"`);
    res.send(jsonData);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: "export_failed", message: errorMsg });
  }
});

/**
 * GET /api/gdpr/export/csv
 * Export user's personal data as CSV
 * User can only export their own data
 */
router.get("/export/csv", requireAuth as any, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const csvData = await exportUserDataAsCSV(user.id);

    // Log the export
    await logAudit({
      userId: user.id,
      action: "data_export_csv",
      entityType: "user",
      entityId: user.id,
      details: {
        format: "csv",
        dataSize: csvData.length,
      },
      req,
    });

    // Send as CSV response
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="curcol-data-export-${new Date().toISOString().split("T")[0]}.csv"`);
    res.send(csvData);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: "export_failed", message: errorMsg });
  }
});

/**
 * GET /api/gdpr/info
 * Get info about exported data without exporting
 * (public endpoint - no auth required)
 */
router.get("/info", async (req, res) => {
  res.json({
    gdpr: {
      "data-subject-rights": [
        "Right to access personal data",
        "Right to data portability (export)",
        "Right to erasure (request)",
        "Right to rectification",
      ],
      "export-formats": ["JSON", "CSV"],
      "included-data": [
        "Personal information",
        "Conversations and group memberships",
        "Messages and attachments",
        "Audit logs related to user",
      ],
      "export-endpoints": [
        "GET /api/gdpr/export/json - Export as JSON",
        "GET /api/gdpr/export/csv - Export as CSV",
      ],
      "notes": [
        "User can only export their own data",
        "Exports are audited and logged",
        "Exports include all personal data for compliance",
      ],
    },
  });
});

/**
 * POST /api/gdpr/delete-request
 * Submit request for account deletion (placeholder for future)
 * Would require admin approval before actual deletion
 */
router.post("/delete-request", requireAuth as any, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "unauthorized" });
    }

    // Log the delete request
    await logAudit({
      userId: user.id,
      action: "data_delete_requested",
      entityType: "user",
      entityId: user.id,
      details: {
        reason: req.body.reason || "User-initiated",
        requestedAt: new Date().toISOString(),
      },
      req,
    });

    res.json({
      status: "delete_requested",
      message: "Your account deletion request has been received. Admin review required. You will be notified via email.",
      requestedAt: new Date().toISOString(),
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: "request_failed", message: errorMsg });
  }
});

export default router;
