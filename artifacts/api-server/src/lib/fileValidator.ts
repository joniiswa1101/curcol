import fs from "fs";
import path from "path";

const MAGIC_BYTES: Record<string, { offset: number; bytes: number[] }[]> = {
  "image/jpeg": [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  "image/png": [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }],
  "image/gif": [
    { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x37] },
    { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x39] },
  ],
  "image/webp": [{ offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }],
  "image/bmp": [{ offset: 0, bytes: [0x42, 0x4d] }],
  "application/pdf": [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }],
  "application/zip": [{ offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }],
  "application/x-rar-compressed": [{ offset: 0, bytes: [0x52, 0x61, 0x72, 0x21] }],
  "application/msword": [{ offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0] }],
  "application/vnd.ms-excel": [{ offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0] }],
  "application/vnd.ms-powerpoint": [{ offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0] }],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    { offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
  ],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    { offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
  ],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    { offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
  ],
  "audio/mpeg": [
    { offset: 0, bytes: [0xff, 0xfb] },
    { offset: 0, bytes: [0xff, 0xf3] },
    { offset: 0, bytes: [0xff, 0xf2] },
    { offset: 0, bytes: [0x49, 0x44, 0x33] },
  ],
  "audio/wav": [{ offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }],
  "audio/ogg": [{ offset: 0, bytes: [0x4f, 0x67, 0x67, 0x53] }],
  "video/mp4": [
    { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
  ],
  "video/webm": [{ offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] }],
  "video/quicktime": [
    { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
  ],
  "audio/webm": [{ offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] }],
  "audio/mp4": [
    { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
  ],
};

const TEXT_MIMES = new Set([
  "text/plain",
  "text/csv",
  "image/svg+xml",
]);

const DANGEROUS_SVG_PATTERNS = [
  /<script[\s>]/i,
  /on\w+\s*=/i,
  /javascript:/i,
  /data:\s*text\/html/i,
  /xlink:href\s*=\s*["']?\s*javascript:/i,
  /<iframe[\s>]/i,
  /<embed[\s>]/i,
  /<object[\s>]/i,
  /<foreignObject[\s>]/i,
];

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateFileMagicBytes(
  filePath: string,
  claimedMime: string
): ValidationResult {
  if (TEXT_MIMES.has(claimedMime)) {
    return validateTextFile(filePath, claimedMime);
  }

  const signatures = MAGIC_BYTES[claimedMime];
  if (!signatures) {
    return { valid: false, reason: `Tidak ada signature untuk MIME type '${claimedMime}'` };
  }

  let buffer: Buffer;
  try {
    const fd = fs.openSync(filePath, "r");
    buffer = Buffer.alloc(32);
    fs.readSync(fd, buffer, 0, 32, 0);
    fs.closeSync(fd);
  } catch {
    return { valid: false, reason: "Gagal membaca file" };
  }

  const matched = signatures.some((sig) => {
    if (buffer.length < sig.offset + sig.bytes.length) return false;
    return sig.bytes.every((b, i) => buffer[sig.offset + i] === b);
  });

  if (!matched) {
    return {
      valid: false,
      reason: `File content tidak sesuai dengan tipe '${claimedMime}'. Kemungkinan file dipalsukan.`,
    };
  }

  return { valid: true };
}

function validateTextFile(
  filePath: string,
  claimedMime: string
): ValidationResult {
  try {
    const content = fs.readFileSync(filePath, "utf-8");

    const nullByteIndex = content.indexOf("\0");
    if (nullByteIndex !== -1 && nullByteIndex < 512) {
      return {
        valid: false,
        reason: "File mengandung binary data yang tidak sesuai dengan tipe teks",
      };
    }

    if (claimedMime === "image/svg+xml") {
      return validateSvg(content);
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: "Gagal membaca file teks" };
  }
}

function validateSvg(content: string): ValidationResult {
  for (const pattern of DANGEROUS_SVG_PATTERNS) {
    if (pattern.test(content)) {
      return {
        valid: false,
        reason: `File SVG mengandung konten berbahaya (${pattern.source})`,
      };
    }
  }

  if (!/<svg[\s>]/i.test(content)) {
    return {
      valid: false,
      reason: "File bukan SVG yang valid (tidak ditemukan tag <svg>)",
    };
  }

  return { valid: true };
}

export function hasDoubleExtension(filename: string): boolean {
  const parts = filename.split(".");
  if (parts.length <= 2) return false;

  const dangerousExts = new Set([
    "exe", "bat", "cmd", "sh", "ps1", "msi", "dll", "com", "scr",
    "vbs", "vbe", "js", "jse", "wsf", "wsh", "pif", "app", "action",
    "cpl", "inf", "reg", "rgs", "sct", "php", "py", "rb", "pl",
    "html", "htm", "xhtml",
  ]);

  for (let i = 1; i < parts.length - 1; i++) {
    if (dangerousExts.has(parts[i].toLowerCase())) return true;
  }
  for (let i = 1; i < parts.length; i++) {
    if (dangerousExts.has(parts[i].toLowerCase())) return true;
  }

  return false;
}

export function deleteFileIfExists(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}
}
