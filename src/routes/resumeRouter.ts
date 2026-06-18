// src/routes/resumeRouter.ts
import { Router } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { S3 } from "aws-sdk";
import path from "path";
import { Queue } from "bullmq";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

// configure multer to store files temporarily in memory
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Initialize S3 client (v2) – using env vars for credentials and bucket
const s3 = new S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET || "resume-screening-bucket";

// BullMQ queue for background parsing
const parseQueue = new Queue("parseQueue", {
  connection: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
  },
});

/**
 * POST /api/resumes/upload
 * Accepts multipart/form-data with field "file" (pdf or docx).
 * Stores the file in S3 and enqueues a parse job.
 * Returns a batchId that can be used to poll results later.
 */
router.post(
  "/upload",
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const batchId = uuidv4();
      const ext = path.extname(req.file.originalname).toLowerCase();
      const s3Key = `${batchId}/${Date.now()}_${req.file.originalname}`;

      // upload buffer to S3
      await s3
        .putObject({
          Bucket: BUCKET_NAME,
          Key: s3Key,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        })
        .promise();

      // enqueue job with S3 location and metadata
      await parseQueue.add("parseResume", {
        batchId,
        s3Key,
        bucket: BUCKET_NAME,
        mimeType: req.file.mimetype,
      });

      res.status(202).json({ batchId, message: "Resume uploaded and queued for processing" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to process upload" });
    }
  }
);

export default router;
