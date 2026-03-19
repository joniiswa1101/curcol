import { Router } from "express";
import { db, attachmentsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

const uploadDir = "./uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const ALLOWED_MIME_TYPES = new Set([
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

const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".sh", ".ps1", ".msi", ".dll", ".com", ".scr",
  ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".pif", ".app", ".action",
  ".cpl", ".inf", ".reg", ".rgs", ".sct", ".php", ".py", ".rb", ".pl",
]);

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) {
      cb(new Error(`Tipe file '${ext}' tidak diizinkan.`));
      return;
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error(`MIME type '${file.mimetype}' tidak diizinkan.`));
      return;
    }
    cb(null, true);
  },
});

router.post("/upload", requireAuth as any, (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: "bad_request", message: err.message });
      return;
    }
    if (err) {
      res.status(400).json({ error: "bad_request", message: err.message });
      return;
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "bad_request", message: "No file provided" }); return; }

  const url = `/api/files/${req.file.filename}`;
  const [attachment] = await db.insert(attachmentsTable).values({
    fileName: req.file.originalname,
    fileSize: req.file.size,
    mimeType: req.file.mimetype,
    url,
    createdAt: new Date(),
  }).returning();

  res.json({
    id: attachment.id,
    fileName: attachment.fileName,
    fileSize: attachment.fileSize,
    mimeType: attachment.mimeType,
    url: attachment.url,
  });
});

router.get("/:filename", (req, res) => {
  const filePath = path.join(process.cwd(), "uploads", req.params.filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(path.resolve(filePath));
  } else {
    res.status(404).json({ error: "not_found" });
  }
});

export default router;
