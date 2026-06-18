// src/worker/parseWorker.ts
/**
 * BullMQ worker that pulls resume parsing jobs from the queue.
 * It reads the uploaded file from the local filesystem, extracts text (PDF via pdf-parse, DOCX via mammoth),
 * and stores the extracted raw text in PostgreSQL for later scoring.
 */
import { Worker, Job } from "bullmq";
import { Pool } from "pg";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

// PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Helper: extract text based on MIME type
async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") {
    const data = await pdfParse(buffer);
    return data.text;
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  // fallback – plain text
  return buffer.toString("utf-8");
}

// Worker listens to the same queue used by the upload route (resume-eval-queue)
const parseWorker = new Worker(
  "resume-eval-queue",
  async (job: Job) => {
    const { batchId, filePath, mimeType } = job.data as {
      batchId: string;
      filePath: string;
      mimeType: string;
    };

    // 1️⃣ Read file from the given path
    const fileBuffer = await fs.promises.readFile(filePath);

    // 2️⃣ Extract raw text
    const rawText = await extractText(fileBuffer, mimeType);

    // 3️⃣ Store extracted text for later scoring
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO resume_texts (batch_id, raw_text) VALUES ($1, $2) ON CONFLICT (batch_id) DO UPDATE SET raw_text = EXCLUDED.raw_text;`,
        [batchId, rawText]
      );
    } finally {
      client.release();
    }

    console.log(`✅ Parsed resume ${batchId}`);
    return { batchId, status: "parsed" };
  },
  {
    connection: {
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: Number(process.env.REDIS_PORT) || 6379,
    },
  }
);

parseWorker.on("failed", (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err);
});

console.log("🔧 Parse worker started – listening on queue 'resume-eval-queue'");
