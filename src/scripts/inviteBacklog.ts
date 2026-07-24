// src/scripts/inviteBacklog.ts
import dotenv from "dotenv";
dotenv.config();

import crypto from "crypto";
import { query } from "../lib/db.js";
import { kekaAssessmentService } from "../integrations/keka/services/assessment.service.js";

async function main() {
  console.log("🚀 Starting backlog candidate invitation check...");

  // 1. Fetch candidates with score >= 80 but missing assessment token
  const res = await query(
    `SELECT c.id, c.name, c.email, c.job_id, j.title as job_title, j.description as job_description 
     FROM candidates c
     LEFT JOIN jobs j ON c.job_id = j.id
     WHERE c.score >= 80 AND c.source_system = 'Keka' AND c.assessment_token IS NULL;`
  );

  if (!res.rowCount || res.rowCount === 0) {
    console.log("✅ No backlog candidates with score >= 80 missing assessment tokens found.");
    process.exit(0);
  }

  console.log(`📋 Found ${res.rowCount} candidates to invite.`);

  for (const candidate of res.rows) {
    const { id: candidateId, name, email, job_id: jobId, job_title: jobTitle, job_description: jobDesc } = candidate;
    console.log(`\n----------------------------------------`);
    console.log(`Processing invitation for: ${name} (${email}) for role: ${jobTitle}`);

    try {
      // 2. Generate token and expiry
      const token = crypto.randomBytes(24).toString("hex");
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 7);

      // 3. Update database
      await query(
        `UPDATE candidates 
         SET status = 'shortlisted',
             assessment_token = $1,
             assessment_token_expiry = $2,
             assessment_status = 'pending'
         WHERE id = $3;`,
        [token, expiry, candidateId]
      );
      console.log(`Updated database record with assessment token: ${token}`);

      // 4. Generate Assessment and Send Email
      if (jobId && jobTitle) {
        console.log(`Generating assessment for Job ID: ${jobId}...`);
        await kekaAssessmentService.generateAssessment(candidateId, jobId, jobTitle, jobDesc || "");
        console.log(`Sending assessment email...`);
        await kekaAssessmentService.sendAssessmentEmail(candidateId, name, email, jobTitle, token);
        console.log(`✅ Successfully invited and emailed: ${name}`);
      } else {
        console.warn(`⚠️ Skipping assessment generation: Job ID or Title is missing.`);
      }
    } catch (err: any) {
      console.error(`❌ Failed to invite candidate ${name}:`, err.message || err);
    }
  }

  console.log("\n🎉 Finished processing backlog invitations.");
  process.exit(0);
}

main().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
