// src/worker/resumeWorker.ts
import { Worker, Job } from "bullmq";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { query } from "../lib/db";
import { computeScore } from "../lib/scoring";
import { connection } from "../api/queue.js";

dotenv.config();

const resumeWorker = new Worker(
  "resume-eval-queue",
  async (job: Job) => {
    const { jobId, resumePath, jobDescription } = job.data as {
      jobId: string;
      resumePath: string;
      jobDescription?: string;
    };
    try {
      // Determine file type by extension
      const ext = path.extname(resumePath).toLowerCase();
      let rawText: string;
      const fileBuffer = fs.readFileSync(resumePath);
      if (ext === ".pdf") {
        const pdfParse = await import("pdf-parse");
        const data = await pdfParse.default(fileBuffer);
        rawText = data.text;
      } else if (ext === ".docx") {
        const result = await (await import("mammoth")).default.extractRawText({ buffer: fileBuffer });
        rawText = result.value;
      } else {
        // Fallback to plain text
        rawText = fileBuffer.toString("utf-8");
      }

      // Store extracted text for later scoring
      await query(
        `INSERT INTO resume_texts (batch_id, s3_key, raw_text)
         VALUES ($1, $2, $3)
         ON CONFLICT (batch_id) DO UPDATE SET raw_text = EXCLUDED.raw_text;`,
        [jobId, path.basename(resumePath), rawText]
      );

      // Compute score using DeepSeek
      const description = jobDescription ?? "";
      const scoreResult = await computeScore(jobId, description);
      // Persist score
      await query(
        `INSERT INTO candidate_scores (batch_id, job_id, overall, criteria)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (batch_id, job_id) DO UPDATE SET overall = EXCLUDED.overall, criteria = EXCLUDED.criteria;`,
        [jobId, jobId, scoreResult.overall, JSON.stringify(scoreResult.criteria)]
      );
      console.log(`✅ Score computed for ${jobId}`);

      console.log(`✅ Resume ${jobId} parsed and saved`);
      return { jobId, status: "parsed" };
    } catch (err) {
      console.error(`❌ Failed to process resume ${jobId}:`, err);
      throw err;
    }
  },
  { connection }
);

resumeWorker.on("failed", (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err);
});

console.log("🔧 Resume worker started – listening on queue 'resume-eval-queue'");
