import { Router } from "express";
import { parseWhatsAppWebhookData } from "../lib/whatsapp.js";
import { db, messagesTable, conversationsTable, conversationMembersTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { broadcastToConversation } from "../lib/websocket.js";

const router = Router();

// ── Meta WhatsApp webhook (keep for compatibility) ─────────────────────────────
router.get("/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!expectedToken) return res.status(400).send("Verify token not configured");
  if (mode === "subscribe" && token === expectedToken) {
    console.log("✅ WhatsApp webhook verified");
    return res.status(200).send(challenge);
  }
  return res.status(403).send("Invalid verify token");
});

// ── Twilio WhatsApp webhook ────────────────────────────────────────────────────
// Configure this URL in Twilio console: POST /api/webhooks/twilio
router.post("/twilio", async (req, res) => {
  try {
    // Respond 200 immediately so Twilio doesn't retry
    res.status(200).send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>");

    const incoming = parseWhatsAppWebhookData(req.body);
    if (!incoming) {
      console.warn("⚠️ Could not parse Twilio webhook body:", req.body);
      return;
    }

    if (!incoming.text && incoming.type === "text") {
      console.warn("⚠️ Received empty text message from", incoming.from);
      return;
    }

    console.log(`📨 Twilio WhatsApp from ${incoming.profileName} (${incoming.from}): ${incoming.text || `[${incoming.type}]`}`);

    const [adminUser] = await db.select().from(usersTable)
      .where(eq(usersTable.role, "admin")).limit(1);
    const systemUserId = adminUser?.id || 1;

    // Find or create conversation for this phone number
    const [existingConv] = await db.select().from(conversationsTable)
      .where(and(
        eq(conversationsTable.type, "whatsapp"),
        eq(conversationsTable.whatsappContactPhone, incoming.from)
      )).limit(1);

    let conversationId: number;

    if (existingConv) {
      conversationId = existingConv.id;
      await db.update(conversationsTable)
        .set({ updatedAt: new Date() })
        .where(eq(conversationsTable.id, conversationId));
    } else {
      const [newConv] = await db.insert(conversationsTable).values({
        type: "whatsapp",
        name: `WhatsApp: ${incoming.profileName}`,
        description: `Chat WhatsApp dengan ${incoming.profileName} (${incoming.from})`,
        whatsappContactPhone: incoming.from,
        whatsappContactName: incoming.profileName,
        createdById: systemUserId,
        updatedAt: new Date(),
      }).returning();
      conversationId = newConv.id;

      // Add admins and managers to the conversation
      const staff = await db.select().from(usersTable).where(eq(usersTable.isActive, true));
      const targetUsers = staff.filter(u => u.role === "admin" || u.role === "manager");

      if (targetUsers.length > 0) {
        await db.insert(conversationMembersTable).values(
          targetUsers.map((u, i) => ({
            conversationId,
            userId: u.id,
            role: i === 0 ? "admin" as const : "member" as const,
          }))
        );
      }

      console.log(`✅ Created WhatsApp conversation #${conversationId} for ${incoming.profileName}`);
    }

    // Store the message
    const [msg] = await db.insert(messagesTable).values({
      conversationId,
      senderId: systemUserId,
      content: incoming.text || `[${incoming.type}] Media dari WhatsApp`,
      type: "text",
      waMessageId: incoming.waMessageId,
      isFromWhatsapp: true,
      createdAt: new Date(),
    }).returning();

    // Broadcast via WebSocket for real-time update
    const members = await db.select({ userId: conversationMembersTable.userId })
      .from(conversationMembersTable)
      .where(eq(conversationMembersTable.conversationId, conversationId));
    const memberIds = members.map(m => m.userId);
    broadcastToConversation(conversationId, memberIds, {
      type: "new_message",
      conversationId,
      data: { ...msg, sender: adminUser || null, attachments: [], reactions: [] }
    });

    console.log(`✅ Twilio WhatsApp stored in conversation #${conversationId}`);
  } catch (error) {
    console.error("❌ Error processing Twilio webhook:", error);
  }
});

export default router;
