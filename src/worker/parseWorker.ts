// src/worker/parseWorker.ts
/**
 * LEGACY, DISABLED BY DEFAULT — text-extraction-only worker.
 *
 * ⚠️  DANGER, historical: this worker consumed the SAME BullMQ queue
 * ('resume-eval-queue') as the real pipeline worker (`resumeWorker.ts`), and it
 * only extracts raw text — it does not create candidates, score them, or send
 * assessment invitations. Because BullMQ delivers each job to exactly one
 * consumer, running both workers meant roughly half of all incoming resumes were
 * silently swallowed: text was stored, but no candidate record was ever created.
 *
 * It is now:
 *   1. Opt-in only (`ENABLE_LEGACY_PARSE_WORKER=true`), and
 *   2. Bound to its own queue name, so it can never steal jobs from the
 *      production screening pipeline.
 *
 * For all normal operation use `npm run worker` (resumeWorker.ts).
 */
import { Worker, Job } from "bullmq";
import { Pool } from "pg";
import { createRequire } from "module";
import mammoth from "mammoth";
import fs from "fs";
import dotenv from "dotenv";
import { connection } from "../api/queue.js";

const require = createRequire(import.meta.url);

dotenv.config();

/** Dedicated queue — deliberately NOT 'resume-eval-queue'. */
const LEGACY_PARSE_QUEUE = process.env.LEGACY_PARSE_QUEUE_NAME || "legacy-text-extract-queue";

// PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Extracts text from a PDF buffer.
 *
 * pdf-parse v2 ships several shapes depending on the module system in use
 * (callable default, `.default`, or a `PDFParse` class), so probe for each rather
 * than relying on a default export that may not exist.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfParse: any = require("pdf-parse");

  if (typeof pdfParse === "function") {
    return (await pdfParse(buffer)).text;
  }
  if (typeof pdfParse?.default === "function") {
    return (await pdfParse.default(buffer)).text;
  }
  if (typeof pdfParse?.PDFParse === "function") {
    const parser = new pdfParse.PDFParse({ data: buffer });
    return (await parser.getText()).text;
  }
  throw new Error("No usable PDF parsing entry point found in the pdf-parse module.");
}

// Helper: extract text based on MIME type
async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") {
    return extractPdfText(buffer);
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  // fallback – plain text
  return buffer.toString("utf-8");
}

if (process.env.ENABLE_LEGACY_PARSE_WORKER !== "true") {
  console.log(
    "ℹ️ [Parse Worker] Legacy text-extraction worker is disabled. " +
    "Set ENABLE_LEGACY_PARSE_WORKER=true to enable it. The production pipeline uses `npm run worker` (resumeWorker)."
  );
} else {
  const parseWorker = new Worker(
    LEGACY_PARSE_QUEUE,
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
    { connection }
  );

  parseWorker.on("failed", (job, err) => {
    console.error(`❌ Job ${job?.id} failed:`, err);
  });

  parseWorker.on("error", (err) => {
    console.error("🚨 [Parse Worker] Connection/Runtime error:", err.message || err);
  });

  console.log(`🔧 Legacy parse worker started – listening on queue '${LEGACY_PARSE_QUEUE}'`);
}
