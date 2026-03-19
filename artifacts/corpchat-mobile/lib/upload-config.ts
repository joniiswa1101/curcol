// File upload validation config (must match backend)
export const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".sh", ".ps1", ".msi", ".dll", ".com", ".scr",
  ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".pif", ".app", ".action",
  ".cpl", ".inf", ".reg", ".rgs", ".sct", ".php", ".py", ".rb", ".pl",
]);

export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/bmp",
  "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv",
  "audio/mpeg", "audio/wav", "audio/ogg", "audio/webm", "audio/mp4",
  "video/mp4", "video/webm", "video/quicktime",
  "application/zip", "application/x-rar-compressed",
]);

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot === -1 ? '' : filename.substring(lastDot).toLowerCase();
}

export function validateFile(filename: string, mimeType: string, fileSize: number): { valid: boolean; error?: string } {
  const ext = getFileExtension(filename);
  
  // Check extension
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `Tipe file '${ext}' tidak diizinkan. Jenis file ini diblokir untuk keamanan.`,
    };
  }
  
  // Check MIME type
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return {
      valid: false,
      error: `Tipe file '${mimeType}' tidak didukung. Silakan upload dokumen, gambar, video, atau audio.`,
    };
  }
  
  // Check file size
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    const maxMB = (MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0);
    return {
      valid: false,
      error: `File terlalu besar (maks ${maxMB} MB).`,
    };
  }
  
  return { valid: true };
}

export function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "📷";
  if (mimeType.startsWith("video/")) return "🎬";
  if (mimeType.startsWith("audio/")) return "🎵";
  if (mimeType.includes("pdf")) return "📄";
  if (mimeType.includes("word") || mimeType.includes("document")) return "📝";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "📊";
  if (mimeType.includes("zip") || mimeType.includes("rar")) return "📦";
  return "📎";
}
