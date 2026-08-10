// src/scripts/autoInviteAllEligible.ts
import dotenv from "dotenv";
dotenv.config();

import crypto from "crypto";
import { query } from "../lib/db.js";
import { kekaAssessmentService } from "../integrations/keka/services/assessment.service.js";

export async function autoInviteAllEligible(): Promise<{ totalEligible: number; newlyInvited: number; errors: number }> {
  console.log("🚀 [Auto-Invite] Starting automatic assessment invitation dispatch for all eligible candidates...");

  // Select candidates with score >= 70 OR stage in (shortlisted, qualified, interviewing, Review) who haven't been invited yet
  const res = await query(`
    SELECT c.id, c.name, c.email, c.job_id, c.role, c.score, c.assessment_token, j.title as job_title, j.description as job_description
    FROM candidates c
    LEFT JOIN jobs j ON c.job_id = j.id
    WHERE (c.score >= 70 OR LOWER(c.status) IN ('shortlisted', 'qualified', 'interviewing', 'review'))
      AND c.email IS NOT NULL AND c.email LIKE '%@%'
      AND (c.assessment_invited_at IS NULL OR c.assessment_token IS NULL);
  `);

  const totalEligible = res.rows.length;
  console.log(`📋 [Auto-Invite] Found ${totalEligible} eligible candidates pending assessment invite emails.`);

  let newlyInvited = 0;
  let errors = 0;

  for (const candidate of res.rows) {
    const { id: candidateId, name, email, job_id: jobId, role, score, job_title: jobTitle, job_description: jobDesc, assessment_token } = candidate;
    const targetRole = jobTitle || role || "Engineering Professional";

    try {
      // 1. Generate token & 7-day expiry if missing
      let token = assessment_token;
      if (!token) {
        token = crypto.randomBytes(24).toString("hex");
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 7);

        await query(
          `UPDATE candidates 
           SET assessment_token = $1,
               assessment_token_expiry = $2,
               assessment_status = 'pending'
           WHERE id = $3;`,
          [token, expiry, candidateId]
        );
      }

      // 2. Generate Assessment Questions & Send Email
      console.log(`✉️ Dispatching assessment email to: ${name} (${email}) for role: ${targetRole}...`);
      
      const effectiveJobId = jobId || "default-job";
      await kekaAssessmentService.generateAssessment(candidateId, effectiveJobId, targetRole, jobDesc || targetRole);
      await kekaAssessmentService.sendAssessmentEmail(candidateId, name, email, targetRole, token);
      
      newlyInvited++;
      console.log(`✅ [Auto-Invite] Successfully invited: ${name} (${email})`);
    } catch (err: any) {
      errors++;
      console.error(`❌ [Auto-Invite] Failed to invite candidate ${name} (${email}):`, err.message || err);
    }
  }

  console.log(`\n🎉 [Auto-Invite] Completed! Total Eligible: ${totalEligible}, Newly Invited: ${newlyInvited}, Errors: ${errors}`);
  return { totalEligible, newlyInvited, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  autoInviteAllEligible().then(() => process.exit(0)).catch(err => {
    console.error("FATAL ERROR in autoInviteAllEligible:", err);
    process.exit(1);
  });
}
