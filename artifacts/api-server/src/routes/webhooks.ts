import { Router } from "express";
import { verifyWhatsAppWebhook, parseWhatsAppWebhookData } from "../lib/whatsapp.js";
import { db, messagesTable, conversationsTable, conversationMembersTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (!expectedToken) return res.status(400).send("Verify token not configured");

  if (mode === "subscribe" && verifyWhatsAppWebhook(token as string, expectedToken)) {
    console.log("✅ WhatsApp webhook verified");
    return res.status(200).send(challenge);
  }

  console.warn("❌ WhatsApp webhook verification failed");
  return res.status(403).send("Invalid verify token");
});

router.post("/whatsapp", async (req, res) => {
  try {
    res.status(200).json({ success: true });

    const incoming = parseWhatsAppWebhookData(req.body);
    if (!incoming || !incoming.text) return;

    console.log(`📨 Incoming WhatsApp from ${incoming.profileName} (${incoming.from}): ${incoming.text}`);

    const adminUser = await db.select().from(usersTable)
      .where(eq(usersTable.role, "admin")).limit(1);
    const systemUserId = adminUser[0]?.id || 1;

    const existingConv = await db.select().from(conversationsTable)
      .where(and(
        eq(conversationsTable.type, "whatsapp"),
        eq(conversationsTable.whatsappContactPhone, incoming.from)
      )).limit(1);

    let conversationId: number;

    if (existingConv.length > 0) {
      conversationId = existingConv[0].id;
      await db.update(conversationsTable)
        .set({ updatedAt: new Date() })
        .where(eq(conversationsTable.id, conversationId));
    } else {
      const [newConv] = await db.insert(conversationsTable).values({
        type: "whatsapp",
        name: `WhatsApp: ${incoming.profileName}`,
        description: `Chat WhatsApp dengan ${incoming.profileName} (+${incoming.from})`,
        whatsappContactPhone: incoming.from,
        whatsappContactName: incoming.profileName,
        createdById: systemUserId,
        updatedAt: new Date(),
      }).returning();
      conversationId = newConv.id;

      const adminsAndManagers = await db.select().from(usersTable)
        .where(eq(usersTable.isActive, true));

      const adminManagerIds = adminsAndManagers
        .filter(u => u.role === "admin" || u.role === "manager")
        .map(u => u.id);

      if (adminManagerIds.length > 0) {
        await db.insert(conversationMembersTable).values(
          adminManagerIds.map((userId, i) => ({
            conversationId,
            userId,
            role: i === 0 ? "admin" as const : "member" as const,
          }))
        );
      }

      console.log(`✅ Created new WhatsApp conversation #${conversationId} for ${incoming.profileName}`);
    }

    await db.insert(messagesTable).values({
      conversationId,
      senderId: systemUserId,
      content: incoming.text || `[${incoming.type}] Media dari WhatsApp`,
      type: "text",
      waMessageId: incoming.waMessageId,
      isFromWhatsapp: true,
      createdAt: new Date(parseInt(incoming.timestamp) * 1000),
    });

    console.log(`✅ WhatsApp message stored in conversation #${conversationId}`);
  } catch (error) {
    console.error("❌ Error processing WhatsApp webhook:", error);
  }
});

export default router;
