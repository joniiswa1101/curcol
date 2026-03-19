import { Router } from "express";
import { requireAdmin } from "../lib/auth.js";
import { sendWhatsAppMessage } from "../lib/whatsapp.js";
import { db, usersTable, conversationsTable, messagesTable } from "@workspace/db";
import { eq, isNotNull, count, and } from "drizzle-orm";

const router = Router();

/**
 * GET /api/admin/whatsapp/status
 * Status koneksi dan konfigurasi WhatsApp
 */
router.get("/status", requireAdmin as any, async (req, res) => {
  const isConfigured = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_NUMBER);
  const phoneNumberId = process.env.TWILIO_WHATSAPP_NUMBER || null;

  const [{ count: usersWithWa }] = await db
    .select({ count: count() })
    .from(usersTable)
    .where(isNotNull(usersTable.whatsappNumber));

  const [{ count: waConversations }] = await db
    .select({ count: count() })
    .from(conversationsTable)
    .where(eq(conversationsTable.type, "whatsapp"));

  const [{ count: waMessages }] = await db
    .select({ count: count() })
    .from(messagesTable)
    .where(eq(messagesTable.isFromWhatsapp, true));

  res.json({
    configured: isConfigured,
    phoneNumberId,
    stats: {
      usersWithWhatsapp: Number(usersWithWa),
      whatsappConversations: Number(waConversations),
      whatsappMessages: Number(waMessages),
    },
    webhookPath: "/api/webhooks/whatsapp",
  });
});

/**
 * POST /api/admin/whatsapp/test
 * Kirim pesan WhatsApp test
 */
router.post("/test", requireAdmin as any, async (req, res) => {
  const { phoneNumber, message } = req.body;

  if (!phoneNumber || !message) {
    res.status(400).json({ error: "phoneNumber dan message diperlukan" });
    return;
  }

  // Format ke E.164: remove all non-digits, then add + prefix
  const digitsOnly = phoneNumber.replace(/[\s\-\(\)+]/g, "");
  const formattedPhone = digitsOnly.startsWith("+") ? digitsOnly : "+" + digitsOnly;

  const msgId = await sendWhatsAppMessage(formattedPhone, message);

  if (msgId) {
    res.json({ success: true, messageId: msgId, phone: formattedPhone });
  } else {
    res.status(500).json({
      success: false,
      error: "Gagal mengirim pesan. Cek konfigurasi API token dan Phone Number ID.",
    });
  }
});

/**
 * GET /api/admin/whatsapp/config
 * Kembalikan nilai konfigurasi yang dibutuhkan untuk setup Meta webhook (admin only)
 */
router.get("/config", requireAdmin as any, async (req, res) => {
  res.json({
    provider: "twilio",
    accountSid: process.env.TWILIO_ACCOUNT_SID ? "configured" : null,
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || null,
    configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_NUMBER),
    webhookPath: "/api/webhooks/twilio",
  });
});

/**
 * GET /api/admin/whatsapp/conversations
 * Daftar konversasi WhatsApp dari kontak eksternal dengan info assignee
 */
router.get("/conversations", requireAdmin as any, async (req, res) => {
  const convs = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.type, "whatsapp"))
    .orderBy(conversationsTable.updatedAt);

  const convsSorted = convs.reverse();

  // Fetch assignee info
  const assigneeIds = [...new Set(convsSorted.filter(c => c.assignedToId).map(c => c.assignedToId as number))];
  let assigneeMap: Map<number, any> = new Map();
  if (assigneeIds.length > 0) {
    const assignees = await db.select().from(usersTable).where(
      assigneeIds.length === 1
        ? eq(usersTable.id, assigneeIds[0])
        : eq(usersTable.isActive, true)
    );
    assignees.filter(a => assigneeIds.includes(a.id)).forEach(a => assigneeMap.set(a.id, a));
  }

  const result = convsSorted.map(c => ({
    ...c,
    assignedTo: c.assignedToId ? (assigneeMap.get(c.assignedToId) || null) : null,
  }));

  res.json({ conversations: result });
});

/**
 * PATCH /api/admin/whatsapp/conversations/:id/assign
 * Assign atau claim konversasi WhatsApp ke user tertentu
 */
router.patch("/conversations/:id/assign", requireAdmin as any, async (req, res) => {
  const convId = parseInt(req.params.id);
  const { assignedToId } = req.body;
  const currentUser = (req as any).user;

  if (isNaN(convId)) {
    res.status(400).json({ error: "ID tidak valid" });
    return;
  }

  const [conv] = await db.select().from(conversationsTable)
    .where(and(eq(conversationsTable.id, convId), eq(conversationsTable.type, "whatsapp")))
    .limit(1);

  if (!conv) {
    res.status(404).json({ error: "Konversasi tidak ditemukan" });
    return;
  }

  const targetUserId = assignedToId ?? currentUser.id;

  const [updated] = await db.update(conversationsTable)
    .set({
      assignedToId: targetUserId,
      waStatus: "assigned",
      updatedAt: new Date(),
    })
    .where(eq(conversationsTable.id, convId))
    .returning();

  const [assignee] = await db.select().from(usersTable).where(eq(usersTable.id, targetUserId));

  res.json({ conversation: { ...updated, assignedTo: assignee || null } });
});

/**
 * PATCH /api/admin/whatsapp/conversations/:id/unassign
 * Kembalikan konversasi ke unassigned
 */
router.patch("/conversations/:id/unassign", requireAdmin as any, async (req, res) => {
  const convId = parseInt(req.params.id);

  if (isNaN(convId)) {
    res.status(400).json({ error: "ID tidak valid" });
    return;
  }

  const [updated] = await db.update(conversationsTable)
    .set({ assignedToId: null, waStatus: "unassigned", updatedAt: new Date() })
    .where(and(eq(conversationsTable.id, convId), eq(conversationsTable.type, "whatsapp")))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Konversasi tidak ditemukan" });
    return;
  }

  res.json({ conversation: { ...updated, assignedTo: null } });
});

/**
 * PATCH /api/admin/whatsapp/conversations/:id/resolve
 * Tandai konversasi sebagai selesai/resolved
 */
router.patch("/conversations/:id/resolve", requireAdmin as any, async (req, res) => {
  const convId = parseInt(req.params.id);

  if (isNaN(convId)) {
    res.status(400).json({ error: "ID tidak valid" });
    return;
  }

  const [updated] = await db.update(conversationsTable)
    .set({ waStatus: "resolved", updatedAt: new Date() })
    .where(and(eq(conversationsTable.id, convId), eq(conversationsTable.type, "whatsapp")))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Konversasi tidak ditemukan" });
    return;
  }

  res.json({ conversation: updated });
});

export default router;
