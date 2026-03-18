import { Router } from "express";
import { requireAdmin } from "../lib/auth.js";
import { sendWhatsAppMessage } from "../lib/whatsapp.js";
import { db, usersTable, conversationsTable, messagesTable } from "@workspace/db";
import { eq, isNotNull, count } from "drizzle-orm";

const router = Router();

/**
 * GET /api/admin/whatsapp/status
 * Status koneksi dan konfigurasi WhatsApp
 */
router.get("/status", requireAdmin as any, async (req, res) => {
  const isConfigured = !!(process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || null;

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

  const cleanPhone = phoneNumber.replace(/[\s\-\(\)+]/g, "");

  const msgId = await sendWhatsAppMessage(cleanPhone, message);

  if (msgId) {
    res.json({ success: true, messageId: msgId, phone: cleanPhone });
  } else {
    res.status(500).json({
      success: false,
      error: "Gagal mengirim pesan. Cek konfigurasi API token dan Phone Number ID.",
    });
  }
});

/**
 * GET /api/admin/whatsapp/conversations
 * Daftar konversasi WhatsApp dari kontak eksternal
 */
router.get("/conversations", requireAdmin as any, async (req, res) => {
  const convs = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.type, "whatsapp"))
    .orderBy(conversationsTable.updatedAt);

  res.json({ conversations: convs.reverse() });
});

export default router;
