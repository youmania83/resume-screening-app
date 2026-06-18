// src/api/routes/resumeRouter.ts
import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { query } from "../../lib/db";

const upload = multer({ dest: "uploads/" }); // temporary local folder
const router = Router();

// POST /api/resumes/upload
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Resume file is required" });
    }

    const batchId = crypto.randomUUID();
    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    let rawText = "";

    const fileBuffer = fs.readFileSync(filePath);

    if (ext === ".pdf") {
      const pdfParse = await import("pdf-parse");
      const parseFn = (pdfParse as any).default || pdfParse;
      const data = await parseFn(fileBuffer);
      rawText = data.text;
    } else if (ext === ".docx") {
      const mammoth = await import("mammoth");
      const parseFn = (mammoth as any).default || mammoth;
      const result = await parseFn.extractRawText({ buffer: fileBuffer });
      rawText = result.value;
    } else {
      rawText = fileBuffer.toString("utf-8");
    }

    // Clean up local temp file
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error("Failed to clean up temp file:", err);
    }

    if (!rawText || !rawText.trim()) {
      return res.status(400).json({ error: "Could not extract text from the resume file." });
    }

    // Save extracted text to database so scoreRouter can read it
    await query(
      `INSERT INTO resume_texts (batch_id, s3_key, raw_text)
       VALUES ($1, $2, $3)
       ON CONFLICT (batch_id) DO UPDATE SET raw_text = EXCLUDED.raw_text;`,
      [batchId, req.file.originalname, rawText]
    );

    res.status(202).json({ batchId, status: "parsed" });
  } catch (err: any) {
    console.error("Error parsing resume:", err);
    res.status(500).json({ error: err.message || "Failed to parse resume" });
  }
});

export default router;
