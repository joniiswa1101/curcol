import axios from "axios";

const WHATSAPP_API_URL = "https://graph.facebook.com/v19.0";
const API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

if (!API_TOKEN || !PHONE_NUMBER_ID) {
  console.warn("⚠️  WhatsApp credentials not configured. Messages won't be sent to WhatsApp.");
} else {
  console.log("✅ WhatsApp Business API configured. Phone Number ID:", PHONE_NUMBER_ID);
}

export async function sendWhatsAppMessage(phoneNumber: string, message: string): Promise<string | null> {
  if (!API_TOKEN || !PHONE_NUMBER_ID) return null;

  try {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: phoneNumber,
        type: "text",
        text: { preview_url: false, body: message },
      },
      { headers: { Authorization: `Bearer ${API_TOKEN}`, "Content-Type": "application/json" } }
    );
    const msgId = response.data?.messages?.[0]?.id;
    console.log("✅ WhatsApp message sent to", phoneNumber, "- ID:", msgId);
    return msgId || null;
  } catch (error: any) {
    console.error("❌ WhatsApp send error:", error.response?.data || error.message);
    return null;
  }
}

export async function sendWhatsAppNotification(phoneNumber: string, title: string, body: string): Promise<boolean> {
  const message = `*${title}*\n\n${body}\n\n_— CurCol Internal App_`;
  const result = await sendWhatsAppMessage(phoneNumber, message);
  return result !== null;
}

export async function sendWhatsAppToMultiple(phoneNumbers: string[], title: string, body: string): Promise<number> {
  let sent = 0;
  for (const phone of phoneNumbers) {
    const ok = await sendWhatsAppNotification(phone, title, body);
    if (ok) sent++;
  }
  return sent;
}

export function verifyWhatsAppWebhook(token: string, expectedToken: string): boolean {
  return token === expectedToken;
}

export interface WhatsAppIncomingMessage {
  from: string;
  profileName: string;
  type: "text" | "image" | "document" | "audio" | "video" | "sticker";
  text?: string;
  mediaId?: string;
  mediaType?: string;
  waMessageId: string;
  timestamp: string;
}

export function parseWhatsAppWebhookData(data: any): WhatsAppIncomingMessage | null {
  try {
    const entry = data?.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];
    if (!message) return null;

    const contact = change?.contacts?.[0];
    const profileName = contact?.profile?.name || "Unknown";
    const from = message.from;
    const timestamp = message.timestamp;
    const type = message.type;
    const waMessageId = message.id;

    const parsed: WhatsAppIncomingMessage = { from, profileName, type, waMessageId, timestamp };

    if (type === "text") {
      parsed.text = message.text?.body;
    } else if (["image", "document", "audio", "video", "sticker"].includes(type)) {
      const media = message[type];
      parsed.mediaId = media?.id;
      parsed.mediaType = media?.mime_type;
    }

    return parsed;
  } catch (error) {
    console.error("Error parsing WhatsApp webhook:", error);
    return null;
  }
}
