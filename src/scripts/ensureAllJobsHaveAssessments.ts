// src/scripts/ensureAllJobsHaveAssessments.ts
import dotenv from "dotenv";
dotenv.config();
import { queryGlobal } from "../lib/tenantDb.js";
import { ensureJobAssessment } from "../lib/assessmentService.js";

async function main() {
  console.log("🚀 Starting verification & backfill of 15 MCQ AI assessments for all active jobs...");

  const jobsRes = await queryGlobal(`
    SELECT id, title, description 
    FROM jobs 
    WHERE sync_status IS NULL OR sync_status != 'removed'
    ORDER BY created_at DESC;
  `);

  console.log(`Found ${jobsRes.rowCount} active job opening(s) to verify.`);

  let createdCount = 0;
  for (const job of jobsRes.rows) {
    try {
      const assessId = await ensureJobAssessment(job.id, job.title, job.description);
      console.log(`✅ [Job ${job.id}] "${job.title}" -> Assessment ID: ${assessId} (15 MCQs Verified)`);
      createdCount++;
    } catch (err: any) {
      console.error(`❌ Failed to ensure assessment for job ${job.id} ("${job.title}"):`, err.message);
    }
  }

  console.log(`\n🎉 Completed! Verified/Created 15 MCQ assessments for ${createdCount} active job opening(s).`);
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
