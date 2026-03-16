import axios from "axios";

const WHATSAPP_API_URL = "https://graph.instagram.com/v18.0";
const API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

if (!API_TOKEN || !PHONE_NUMBER_ID) {
  console.warn(
    "⚠️  WhatsApp credentials not configured. Messages won't be sent to WhatsApp."
  );
}

interface WhatsAppMessage {
  to: string;
  text: string;
}

interface WhatsAppMediaMessage {
  to: string;
  mediaUrl: string;
  mediaType: "image" | "document" | "audio" | "video";
  caption?: string;
}

export async function sendWhatsAppMessage(
  phoneNumber: string,
  message: string
): Promise<boolean> {
  if (!API_TOKEN || !PHONE_NUMBER_ID) {
    console.log("WhatsApp not configured, skipping message send");
    return false;
  }

  try {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: phoneNumber,
        type: "text",
        text: {
          preview_url: false,
          body: message,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ WhatsApp message sent:", response.data?.messages?.[0]?.id);
    return true;
  } catch (error: any) {
    console.error(
      "❌ WhatsApp send error:",
      error.response?.data || error.message
    );
    return false;
  }
}

export async function sendWhatsAppMedia(
  phoneNumber: string,
  mediaUrl: string,
  mediaType: "image" | "document" | "audio" | "video",
  caption?: string
): Promise<boolean> {
  if (!API_TOKEN || !PHONE_NUMBER_ID) {
    console.log("WhatsApp not configured, skipping media send");
    return false;
  }

  try {
    const typeMap = {
      image: "image",
      document: "document",
      audio: "audio",
      video: "video",
    };

    const payload: any = {
      messaging_product: "whatsapp",
      to: phoneNumber,
      type: typeMap[mediaType],
    };

    payload[typeMap[mediaType]] = {
      link: mediaUrl,
    };

    if (caption && (mediaType === "image" || mediaType === "video")) {
      payload[typeMap[mediaType]].caption = caption;
    }

    const response = await axios.post(
      `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ WhatsApp media sent:", response.data?.messages?.[0]?.id);
    return true;
  } catch (error: any) {
    console.error(
      "❌ WhatsApp media send error:",
      error.response?.data || error.message
    );
    return false;
  }
}

export function verifyWhatsAppWebhook(
  token: string,
  expectedToken: string
): boolean {
  return token === expectedToken;
}

export interface WhatsAppIncomingMessage {
  from: string;
  type: "text" | "image" | "document" | "audio" | "video" | "location";
  text?: string;
  mediaUrl?: string;
  mediaType?: string;
  timestamp: string;
}

export function parseWhatsAppWebhookData(data: any): WhatsAppIncomingMessage | null {
  try {
    const message = data?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return null;

    const from = message.from;
    const timestamp = message.timestamp;
    const type = message.type;

    let parsed: WhatsAppIncomingMessage = {
      from,
      type: type as any,
      timestamp,
    };

    if (type === "text") {
      parsed.text = message.text?.body;
    } else if (["image", "document", "audio", "video"].includes(type)) {
      const media = message[type];
      parsed.mediaUrl = media?.link;
      parsed.mediaType = media?.mime_type;
    }

    return parsed;
  } catch (error) {
    console.error("Error parsing WhatsApp webhook:", error);
    return null;
  }
}
