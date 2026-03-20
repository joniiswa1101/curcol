import { Router } from "express";
import { db, stickersTable } from "@workspace/db";
import { requireAuth } from "../lib/auth.js";

const router = Router();

// ── Get all stickers grouped by pack ───────────────────────────────────────
router.get("/", requireAuth as any, async (req, res) => {
  try {
    const stickers = await db
      .select()
      .from(stickersTable)
      .orderBy(stickersTable.packId, stickersTable.order);

    const grouped: Record<string, any[]> = {};
    stickers.forEach(sticker => {
      if (!grouped[sticker.packId]) {
        grouped[sticker.packId] = [];
      }
      grouped[sticker.packId].push({
        id: sticker.id,
        url: sticker.stickerUrl,
        alt: sticker.alt || sticker.packName,
        packId: sticker.packId,
      });
    });

    const packs = Object.entries(grouped).map(([packId, items]) => ({
      id: packId,
      name: items[0]?.alt?.split('/')[0] || packId,
      stickers: items,
    }));

    res.json({ packs });
  } catch (error: any) {
    console.error("Stickers fetch error:", error);
    res.status(500).json({ error: "Failed to fetch stickers" });
  }
});

export default router;
