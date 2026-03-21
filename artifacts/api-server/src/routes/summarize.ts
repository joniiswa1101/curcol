import { Router } from "express";
import { db, messagesTable, conversationMembersTable, usersTable } from "@workspace/db";
import { eq, and, desc, gte, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import OpenAI from "openai";

const router = Router();

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

router.post("/conversation/:conversationId", requireAuth as any, async (req, res) => {
  try {
    const currentUser = (req as any).user;
    const convId = parseInt(req.params.conversationId);
    if (isNaN(convId) || convId <= 0) {
      return res.status(400).json({ error: "Invalid conversation ID" });
    }

    const rawCount = parseInt(req.body.messageCount ?? "50");
    const messageCount = isNaN(rawCount) ? 50 : Math.max(1, Math.min(rawCount, 200));

    const since = req.body.since;
    if (since && isNaN(Date.parse(since))) {
      return res.status(400).json({ error: "Invalid 'since' date format" });
    }

    const [membership] = await db
      .select({ id: conversationMembersTable.id })
      .from(conversationMembersTable)
      .where(and(
        eq(conversationMembersTable.conversationId, convId),
        eq(conversationMembersTable.userId, currentUser.id)
      ));
    if (!membership) return res.status(403).json({ error: "Not a member of this conversation" });

    const conditions: any[] = [
      eq(messagesTable.conversationId, convId),
      eq(messagesTable.isDeleted, false),
    ];

    if (since) {
      conditions.push(gte(messagesTable.createdAt, new Date(since)));
    }

    const messages = await db
      .select({
        id: messagesTable.id,
        content: messagesTable.content,
        createdAt: messagesTable.createdAt,
        senderName: usersTable.name,
      })
      .from(messagesTable)
      .leftJoin(usersTable, eq(messagesTable.senderId, usersTable.id))
      .where(and(...conditions))
      .orderBy(desc(messagesTable.createdAt))
      .limit(messageCount);

    if (messages.length === 0) {
      return res.json({ summary: "Tidak ada pesan untuk diringkas.", messageCount: 0 });
    }

    const reversed = messages.reverse();
    const chatText = reversed
      .map(m => `[${m.senderName}]: ${m.content || "(file/attachment)"}`)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Kamu adalah asisten ringkasan chat perusahaan. Buat ringkasan yang jelas dan terstruktur dari percakapan berikut. Gunakan bahasa Indonesia. Format output:

**Ringkasan:**
[1-2 kalimat ringkasan umum]

**Poin Penting:**
- [poin 1]
- [poin 2]
- ...

**Keputusan/Action Items:**
- [jika ada keputusan atau tugas yang perlu dilakukan]

Jika percakapan terlalu singkat atau trivial, cukup beri ringkasan pendek saja.`,
        },
        {
          role: "user",
          content: `Ringkas percakapan ini (${messages.length} pesan):\n\n${chatText}`,
        },
      ],
      max_tokens: 1000,
      temperature: 0.3,
    });

    const summary = completion.choices[0]?.message?.content || "Gagal membuat ringkasan.";

    res.json({
      summary,
      messageCount: messages.length,
      timeRange: {
        from: reversed[0]?.createdAt,
        to: reversed[reversed.length - 1]?.createdAt,
      },
    });
  } catch (e: any) {
    console.error("[Summarize] Error:", e);
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

router.post("/digest", requireAuth as any, async (req, res) => {
  try {
    const currentUser = (req as any).user;
    const { period } = req.body;
    if (period && period !== "daily" && period !== "weekly") {
      return res.status(400).json({ error: "Period must be 'daily' or 'weekly'" });
    }
    const selectedPeriod = period || "daily";

    const since = new Date();
    if (selectedPeriod === "weekly") {
      since.setDate(since.getDate() - 7);
    } else {
      since.setDate(since.getDate() - 1);
    }

    const userConversations = await db
      .select({ conversationId: conversationMembersTable.conversationId })
      .from(conversationMembersTable)
      .where(eq(conversationMembersTable.userId, currentUser.id));

    if (userConversations.length === 0) {
      return res.json({ digest: "Tidak ada percakapan untuk diringkas.", conversations: [] });
    }

    const convIds = userConversations.map(c => c.conversationId);

    const allMessages = await db
      .select({
        conversationId: messagesTable.conversationId,
        content: messagesTable.content,
        senderName: usersTable.name,
        createdAt: messagesTable.createdAt,
      })
      .from(messagesTable)
      .leftJoin(usersTable, eq(messagesTable.senderId, usersTable.id))
      .where(and(
        inArray(messagesTable.conversationId, convIds),
        eq(messagesTable.isDeleted, false),
        gte(messagesTable.createdAt, since),
      ))
      .orderBy(desc(messagesTable.createdAt))
      .limit(500);

    const groupedByConv = new Map<number, typeof allMessages>();
    for (const msg of allMessages) {
      const existing = groupedByConv.get(msg.conversationId) || [];
      existing.push(msg);
      groupedByConv.set(msg.conversationId, existing);
    }

    const conversationSummaries: { conversationId: number; name: string; messageCount: number; preview: string }[] = [];

    for (const [convId, messages] of groupedByConv) {
      const preview = messages.slice(0, 3).map(m => `${m.senderName}: ${(m.content || "").substring(0, 50)}`).join(" | ");
      conversationSummaries.push({
        conversationId: convId,
        name: `Conversation #${convId}`,
        messageCount: messages.length,
        preview,
      });
    }

    if (conversationSummaries.length === 0) {
      return res.json({ digest: `Tidak ada pesan baru dalam ${selectedPeriod === "weekly" ? "7 hari" : "24 jam"} terakhir.`, conversations: [] });
    }

    const overviewText = conversationSummaries
      .map(c => `- ${c.name} (${c.messageCount} pesan): ${c.preview}`)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Kamu adalah asisten ringkasan digest perusahaan. Buat ringkasan ${selectedPeriod === "weekly" ? "mingguan" : "harian"} dari aktivitas chat. Gunakan bahasa Indonesia. Format:

**Digest ${selectedPeriod === "weekly" ? "Mingguan" : "Harian"}**
[Ringkasan keseluruhan aktivitas dalam 2-3 kalimat]

**Percakapan Aktif:**
[List percakapan yang paling aktif dan topik utamanya]

**Hal yang Perlu Perhatian:**
[Jika ada action items atau topik penting]`,
        },
        {
          role: "user",
          content: `Buat digest dari ${conversationSummaries.length} percakapan aktif:\n\n${overviewText}`,
        },
      ],
      max_tokens: 800,
      temperature: 0.3,
    });

    const digest = completion.choices[0]?.message?.content || "Gagal membuat digest.";

    res.json({
      digest,
      period: selectedPeriod,
      since: since.toISOString(),
      conversations: conversationSummaries,
    });
  } catch (e: any) {
    console.error("[Digest] Error:", e);
    res.status(500).json({ error: "Failed to generate digest" });
  }
});

export default router;
