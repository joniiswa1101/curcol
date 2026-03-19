import twilio from "twilio";

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER; // e.g. "+14155238886" or your registered number

function getClient() {
  if (!ACCOUNT_SID || !AUTH_TOKEN) return null;
  return twilio(ACCOUNT_SID, AUTH_TOKEN);
}

if (!ACCOUNT_SID || !AUTH_TOKEN) {
  console.warn("⚠️  Twilio credentials not configured. WhatsApp messages won't be sent.");
} else if (!TWILIO_WA_NUMBER) {
  console.warn("⚠️  TWILIO_WHATSAPP_NUMBER not set. WhatsApp messages won't be sent.");
} else {
  console.log(`✅ Twilio WhatsApp configured. Sending from: ${TWILIO_WA_NUMBER}`);
}

function formatWaNumber(phone: string): string {
  const cleaned = phone.replace(/[\s\-]/g, "");
  const withPlus = cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
  return `whatsapp:${withPlus}`;
}

export async function sendWhatsAppMessage(phoneNumber: string, message: string): Promise<string | null> {
  const client = getClient();
  if (!client || !TWILIO_WA_NUMBER) return null;

  try {
    const msg = await client.messages.create({
      from: formatWaNumber(TWILIO_WA_NUMBER),
      to: formatWaNumber(phoneNumber),
      body: message,
    });
    console.log(`✅ WhatsApp sent to ${phoneNumber} via Twilio — SID: ${msg.sid}`);
    return msg.sid;
  } catch (error: any) {
    console.error(`❌ Twilio WhatsApp error:`, error?.message || error);
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

// Parse Twilio webhook (form-encoded body)
export function parseWhatsAppWebhookData(body: any): WhatsAppIncomingMessage | null {
  try {
    const from = (body.From || "").replace("whatsapp:", "").trim();
    const profileName = body.ProfileName || from;
    const text = body.Body || "";
    const waMessageId = body.MessageSid || "";
    const timestamp = String(Date.now());
    const numMedia = parseInt(body.NumMedia || "0");

    if (!from) return null;

    const parsed: WhatsAppIncomingMessage = {
      from,
      profileName,
      type: "text",
      text,
      waMessageId,
      timestamp,
    };

    if (numMedia > 0) {
      parsed.type = "image";
      parsed.mediaId = body.MediaUrl0;
      parsed.mediaType = body.MediaContentType0;
    }

    return parsed;
  } catch (error) {
    console.error("Error parsing Twilio webhook:", error);
    return null;
  }
}
