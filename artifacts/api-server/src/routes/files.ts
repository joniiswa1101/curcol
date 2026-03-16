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

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

router.post("/upload", requireAuth as any, upload.single("file"), async (req, res) => {
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
