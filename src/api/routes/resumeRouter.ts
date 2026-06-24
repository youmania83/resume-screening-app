// src/api/routes/resumeRouter.ts
import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import AdmZip from "adm-zip";
import { StorageManager } from "../../lib/storage/StorageProvider.js";
import { IngestQueue } from "../../lib/queue/ingestQueue.js";
import { queryGlobal } from "../../lib/tenantDb.js";
import { creditCheck } from "../middleware/creditMiddleware.js";
import { TenantUsageService } from "../../services/TenantUsageService.js";
import { rateLimiter } from "../middleware/security.js";

const upload = multer({ dest: "uploads/" });
const router = Router();

const ACCEPTED_EXTS = [".pdf", ".docx", ".doc", ".txt"];
const BLACKLISTED_EXTS = [".exe", ".js", ".bat", ".cmd", ".scr"];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

/**
 * Validates and enqueues a single file buffer.
 */
async function processAndEnqueue(
  tenantId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string,
  jobId?: string
): Promise<string> {
  const inboxId = crypto.randomUUID();
  const ext = path.extname(fileName).toLowerCase();

  // Validate extension
  if (BLACKLISTED_EXTS.includes(ext) || !ACCEPTED_EXTS.includes(ext)) {
    throw new Error(`Unsupported or dangerous file extension: ${ext}`);
  }

  // Upload to Storage Provider
  const storage = StorageManager.getProvider();
  const storageMeta = await storage.uploadFile(tenantId, fileName, buffer);

  // Compute file hash
  const fileHash = crypto.createHash("md5").update(buffer).digest("hex");

  // Create inbox record
  await queryGlobal(
    `INSERT INTO resume_inbox (id, tenant_id, file_name, file_url, file_hash, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'Queued', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
    [inboxId, tenantId, fileName, storageMeta.fileUrl, fileHash]
  );

  // Increment usage count and storage
  await TenantUsageService.incrementMetric(tenantId, "resumes_uploaded", 1);
  await TenantUsageService.incrementMetric(tenantId, "storage_files_count", 1);
  await TenantUsageService.incrementMetric(tenantId, "storage_used", buffer.length);

  // Save temp file on disk for worker
  const tempPath = path.resolve("uploads", `${inboxId}${ext}`);
  await fs.promises.writeFile(tempPath, buffer);

  // Enqueue parsing job
  await IngestQueue.enqueue(tenantId, inboxId, tempPath, mimeType, jobId);

  return inboxId;
}

// POST /api/resumes/upload - Supports single, bulk, and ZIP resume ingestion
router.post("/upload", rateLimiter(1 * 60 * 1000, 20), creditCheck("upload"), upload.array("files", 50), async (req: any, res: any, next: any) => {
  try {
    const files = req.files as Express.Multer.File[];
    const jobId = req.body.jobId;
    const tenantId = req.headers["x-tenant-id"] || "default-tenant";

    if (!files || files.length === 0) {
       res.status(400).json({ error: "No resume files uploaded." });
       return;
    }

    const enqueuedIds: string[] = [];
    const errors: string[] = [];

    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();

      try {
        const fileBuffer = fs.readFileSync(file.path);

        // Clean up multer's temporary file
        try {
          fs.unlinkSync(file.path);
        } catch (e) {
          console.warn("Failed to delete multer temporary file:", e);
        }

        // Handle ZIP Uploads
        if (ext === ".zip" || file.mimetype === "application/zip" || file.mimetype === "application/x-zip-compressed") {
          // ZIP Safeguard 1: Max ZIP file size 100MB
          if (file.size > 100 * 1024 * 1024) {
            errors.push(`${file.originalname}: ZIP file exceeds maximum size of 100MB.`);
            continue;
          }

          let zip: AdmZip;
          try {
            zip = new AdmZip(fileBuffer);
          } catch {
            errors.push(`${file.originalname}: Failed to open or parse ZIP archive.`);
            continue;
          }

          const entries = zip.getEntries();
          // ZIP Safeguard 2: Max 500 files extracted
          if (entries.length > 500) {
            errors.push(`${file.originalname}: ZIP archive exceeds maximum entry limit of 500 files.`);
            continue;
          }

          for (const entry of entries) {
            if (entry.isDirectory) continue;

            const entryName = entry.entryName;
            const entryExt = path.extname(entryName).toLowerCase();

            // Ignore system or non-resume files inside zip
            if (entryName.includes("__MACOSX") || entryName.startsWith(".")) {
              continue;
            }

            // ZIP Safeguard 3: Max 25MB extracted size per file (Zip Bomb protection)
            if (entry.header.size > MAX_FILE_SIZE) {
              errors.push(`${entryName}: Extracted file size exceeds 25MB limit.`);
              continue;
            }

            if (!ACCEPTED_EXTS.includes(entryExt)) {
              continue; // Skip unsupported files silently or note it
            }

            try {
              const entryBuffer = entry.getData();
              const inboxId = await processAndEnqueue(
                tenantId,
                path.basename(entryName),
                entryBuffer,
                "application/octet-stream",
                jobId
              );
              enqueuedIds.push(inboxId);
            } catch (e: any) {
              errors.push(`${entryName}: ${e.message}`);
            }
          }
        } else {
          // Handle Regular file uploads (Single or Bulk)
          if (file.size > MAX_FILE_SIZE) {
            errors.push(`${file.originalname}: File size exceeds 25MB limit.`);
            continue;
          }

          const inboxId = await processAndEnqueue(
            tenantId,
            file.originalname,
            fileBuffer,
            file.mimetype,
            jobId
          );
          enqueuedIds.push(inboxId);
        }
      } catch (e: any) {
        errors.push(`${file.originalname}: ${e.message}`);
      }
    }

    res.status(202).json({
      success: true,
      message: `Successfully accepted and enqueued ${enqueuedIds.length} resumes.`,
      enqueuedIds,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    next(err);
  }
});

export default router;
