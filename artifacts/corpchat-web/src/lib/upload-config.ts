// Blocked file extensions (must match backend)
export const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".sh", ".ps1", ".msi", ".dll", ".com", ".scr",
  ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".pif", ".app", ".action",
  ".cpl", ".inf", ".reg", ".rgs", ".sct", ".php", ".py", ".rb", ".pl",
]);

// Allowed MIME types (must match backend)
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

// Max file size (10 MB, matches backend)
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// Get file extension
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot === -1 ? '' : filename.substring(lastDot).toLowerCase();
}

// Validate file before upload
export function validateFile(file: File): { valid: boolean; error?: string } {
  const ext = getFileExtension(file.name);
  
  // Check extension
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `Tipe file '${ext}' tidak diizinkan. Jenis file ini diblokir untuk keamanan.`,
    };
  }
  
  // Check MIME type
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      valid: false,
      error: `Tipe file '${file.type}' tidak didukung. Silakan upload dokumen, gambar, video, atau audio.`,
    };
  }
  
  // Check file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const maxMB = (MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0);
    return {
      valid: false,
      error: `File terlalu besar (maks ${maxMB} MB).`,
    };
  }
  
  return { valid: true };
}
