import { Router } from "express";
import {
  verifyWhatsAppWebhook,
  parseWhatsAppWebhookData,
} from "../lib/whatsapp.js";
import { db, messagesTable, conversationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// WhatsApp webhook verification (GET request)
router.get("/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (!expectedToken) {
    console.warn(
      "⚠️  WHATSAPP_WEBHOOK_VERIFY_TOKEN not configured in environment"
    );
    return res.status(400).send("Verify token not configured");
  }

  if (mode === "subscribe" && verifyWhatsAppWebhook(token as string, expectedToken)) {
    console.log("✅ WhatsApp webhook verified");
    return res.status(200).send(challenge);
  }

  console.warn("❌ WhatsApp webhook verification failed");
  return res.status(403).send("Invalid verify token");
});

// WhatsApp incoming messages (POST request)
router.post("/whatsapp", async (req, res) => {
  try {
    const incoming = parseWhatsAppWebhookData(req.body);

    if (!incoming) {
      return res.status(200).json({ success: true });
    }

    console.log("📨 Incoming WhatsApp message from:", incoming.from);

    // Find WhatsApp conversation for this phone number
    // In production, you'd map phone numbers to users/conversations
    const whatsappConversation = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.type, "whatsapp"))
      .limit(1);

    if (whatsappConversation.length === 0) {
      console.log("No WhatsApp conversation found, creating default one");
      // In production: create or fetch appropriate conversation
      return res.status(200).json({ success: true });
    }

    // Store the message
    const message = {
      conversationId: whatsappConversation[0].id,
      senderId: 1, // In production: map from phone number to user
      type: "text" as const,
      content: incoming.text || `[${incoming.type}] WhatsApp media received`,
      attachmentUrl: incoming.mediaUrl || null,
      attachmentType: incoming.mediaType || null,
      createdAt: new Date(parseInt(incoming.timestamp) * 1000),
    };

    await db.insert(messagesTable).values(message);

    console.log("✅ WhatsApp message stored");
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("❌ Error processing WhatsApp webhook:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
