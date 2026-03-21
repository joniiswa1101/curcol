import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import OpenAI from "openai";

const router = Router();

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const SUPPORTED_LANGUAGES: Record<string, string> = {
  id: "Indonesian",
  en: "English",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese (Simplified)",
  ar: "Arabic",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  ru: "Russian",
  th: "Thai",
  vi: "Vietnamese",
  ms: "Malay",
  hi: "Hindi",
};

const MAX_TEXT_LENGTH = 2000;

router.post("/message", requireAuth as any, async (req, res) => {
  try {
    const { text, targetLang } = req.body;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "Text is required" });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({ error: `Text too long (max ${MAX_TEXT_LENGTH} chars)` });
    }
    if (!targetLang || !SUPPORTED_LANGUAGES[targetLang]) {
      return res.status(400).json({ error: "Invalid target language", supported: Object.keys(SUPPORTED_LANGUAGES) });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a professional translator. Translate the following message to ${SUPPORTED_LANGUAGES[targetLang]}. Only return the translated text, nothing else. Preserve the original formatting, emojis, and tone.`,
        },
        { role: "user", content: text },
      ],
      max_tokens: 1000,
      temperature: 0.2,
    });

    const translation = completion.choices[0]?.message?.content || "";

    res.json({ translation, targetLang, sourceLang: "auto" });
  } catch (e: any) {
    console.error("[Translate] Error:", e);
    res.status(500).json({ error: "Failed to translate message" });
  }
});

router.post("/detect", requireAuth as any, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "Text is required" });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({ error: `Text too long (max ${MAX_TEXT_LENGTH} chars)` });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Detect the language of the following text. Reply ONLY with the ISO 639-1 two-letter language code (e.g., "en", "id", "ja", "ko", "zh", "es", "fr", "de"). Nothing else.`,
        },
        { role: "user", content: text },
      ],
      max_tokens: 10,
      temperature: 0,
    });

    const detected = (completion.choices[0]?.message?.content || "").trim().toLowerCase().substring(0, 2);
    res.json({ language: detected, name: SUPPORTED_LANGUAGES[detected] || detected });
  } catch (e: any) {
    console.error("[Detect Language] Error:", e);
    res.status(500).json({ error: "Failed to detect language" });
  }
});

router.post("/breakdown", requireAuth as any, async (req, res) => {
  try {
    const { text, sourceLang } = req.body;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "Text is required" });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({ error: `Text too long (max ${MAX_TEXT_LENGTH} chars)` });
    }

    const langHint = sourceLang && SUPPORTED_LANGUAGES[sourceLang]
      ? `The text is in ${SUPPORTED_LANGUAGES[sourceLang]}.`
      : "Auto-detect the language.";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a language learning assistant. ${langHint} Break down the following sentence word by word for an Indonesian-speaking learner. For each word/phrase, provide:
1. The original word
2. Pronunciation guide (romanization if non-Latin script)
3. Indonesian translation
4. Part of speech (noun, verb, adjective, etc.)

Format as JSON array:
[{"word": "...", "pronunciation": "...", "meaning": "...", "pos": "..."}]

Also provide a brief grammar note about the sentence structure at the end.

Return valid JSON object: {"words": [...], "grammar": "..."}`,
        },
        { role: "user", content: text },
      ],
      max_tokens: 1500,
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let parsed;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      parsed = { words: [], grammar: raw };
    }

    res.json({ breakdown: parsed, sourceLang: sourceLang || "auto" });
  } catch (e: any) {
    console.error("[Breakdown] Error:", e);
    res.status(500).json({ error: "Failed to generate word breakdown" });
  }
});

router.post("/lesson", requireAuth as any, async (req, res) => {
  try {
    const { text, targetLang } = req.body;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "Text is required" });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({ error: `Text too long (max ${MAX_TEXT_LENGTH} chars)` });
    }

    const langName = (targetLang && SUPPORTED_LANGUAGES[targetLang]) || "the source language";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a friendly language teacher. Based on the following chat message, create a short, fun mini-lesson in Indonesian for learning ${langName}. Include:

1. **Kosakata Baru** — 3-5 key vocabulary words from the message with pronunciation and meaning
2. **Pola Kalimat** — One grammar pattern used in the message, with 2 example sentences
3. **Latihan Cepat** — One quick practice question (fill-in-the-blank or translate)
4. **Tips Budaya** — A brief cultural note related to the language/context (if applicable)

Keep it concise, engaging, and practical. Use emoji sparingly for visual appeal.`,
        },
        { role: "user", content: text },
      ],
      max_tokens: 1200,
      temperature: 0.5,
    });

    const lesson = completion.choices[0]?.message?.content || "Gagal membuat pelajaran.";
    res.json({ lesson, targetLang: targetLang || "auto" });
  } catch (e: any) {
    console.error("[Lesson] Error:", e);
    res.status(500).json({ error: "Failed to generate lesson" });
  }
});

router.get("/languages", requireAuth as any, (_req, res) => {
  res.json({ languages: SUPPORTED_LANGUAGES });
});

export default router;
