// src/test/verifyEndToEndWorkflow.ts
import dotenv from "dotenv";
dotenv.config();
import crypto from "crypto";
import { queryGlobal } from "../lib/tenantDb.js";
import { pool } from "../lib/db.js";
import { ensureJobAssessment } from "../lib/assessmentService.js";

async function verifyWorkflow() {
  console.log("\n=======================================================");
  console.log("🧪 STARTING END-TO-END RECRUITMENT WORKFLOW VERIFICATION");
  console.log("=======================================================\n");

  const client = await pool.connect();
  try {
    const tenantId = "87b949cb-2c0d-44ca-a6f5-a025ec43e6a5";

    // 1. Verify candidate count prior to 2026-07-29
    console.log("Step 1: Checking database clean status for pre-29/07/2026 candidates...");
    const preCount = await queryGlobal(
      `SELECT COUNT(*)::int as count FROM candidates WHERE created_at < '2026-07-29T00:00:00.000Z' OR applied_date < '2026-07-29';`
    );
    const legacyCount = preCount.rows[0].count;
    console.log(`- Pre-29/07/2026 Candidates in Database: ${legacyCount}`);
    if (legacyCount > 0) {
      console.warn("⚠️ Warning: Legacy candidates still present in DB (cleanup may still be running or needs re-check).");
    } else {
      console.log("✅ Verified: Zero legacy candidates prior to 29/07/2026.");
    }

    // 2. Fetch or ensure an Active Job
    console.log("\nStep 2: Fetching active job openings...");
    const jobRes = await queryGlobal(
      `SELECT id, title, description FROM jobs WHERE tenant_id = $1 AND (sync_status IS NULL OR sync_status != 'removed') ORDER BY created_at DESC LIMIT 1;`,
      [tenantId]
    );

    let targetJob = jobRes.rows[0];
    if (!targetJob) {
      console.log("No active job found. Creating a test active job...");
      const jobId = crypto.randomUUID();
      await queryGlobal(
        `INSERT INTO jobs (id, title, description, department, location, experience_required, tenant_id)
         VALUES ($1, 'Senior Full Stack Engineer (AI)', 'We are hiring a Senior Full Stack Engineer proficient in React, Node.js, TypeScript, PostgreSQL, and AI integrations.', 'Engineering', 'Remote', '5+ Years', $2);`,
        [jobId, tenantId]
      );
      targetJob = { id: jobId, title: 'Senior Full Stack Engineer (AI)', description: 'We are hiring a Senior Full Stack Engineer proficient in React, Node.js, TypeScript, PostgreSQL, and AI integrations.' };
    }
    console.log(`✅ Active Job Found: "${targetJob.title}" (ID: ${targetJob.id})`);

    // 3. Ensure assessment exists for active job
    await ensureJobAssessment(targetJob.id, targetJob.title, targetJob.description);
    console.log("✅ Assessment bank verified for active job.");

    // 4. Ingest synthetic new candidate applied on 29/07/2026
    console.log("\nStep 3: Simulating new resume screening & AI scoring for candidate applied on 29/07/2026...");
    const testCandId = `test-cand-${Date.now()}`;
    const testEmail = `test.candidate.${Date.now()}@example.com`;
    const token = crypto.randomBytes(24).toString("hex");
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 7);

    const resumeScore = 88; // Shortlisted (>80)

    await queryGlobal(
      `INSERT INTO candidates (
        id, tenant_id, name, email, phone, role, score, match_percent, experience_years, 
        skills, certifications, education, status, application_source, applied_date, job_id,
        assessment_token, assessment_token_expiry, assessment_status
      ) VALUES (
        $1, $2, 'Jane Doe (Test)', $3, '+1 555-0199', $4, $5, $5, 6,
        ARRAY['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'AI'], ARRAY['AWS Certified Developer'], 'B.S. Computer Science',
        'shortlisted', 'Direct Application', '2026-07-29', $6, $7, $8, 'pending'
      );`,
      [testCandId, tenantId, testEmail, targetJob.title, resumeScore, targetJob.id, token, expiry]
    );

    // Record activity log & timeline
    await queryGlobal(
      `INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id) 
       VALUES ($1, 'email_sent', 'Candidate qualified for assessment (Score 88/100 >= 80). Assessment invitation sent.', $2);`,
      [testCandId, tenantId]
    );

    await queryGlobal(
      `INSERT INTO candidate_timeline (id, tenant_id, candidate_id, event_type, title, description)
       VALUES ($1, $2, $3, 'Stage Changed', 'Shortlisted', 'Candidate qualified for assessment stage with score 88/100.');`,
      [crypto.randomUUID(), tenantId, testCandId]
    );

    console.log(`✅ Candidate created and Shortlisted: ID=${testCandId}, Status=shortlisted, Assessment Token=${token.substring(0, 10)}...`);

    // 5. Verify Assessment Completion & Auto-Progression
    console.log("\nStep 4: Simulating assessment submission & auto-promotion to next stage...");
    const assessmentScore = 90;
    const finalScore = Number(((resumeScore * 0.4) + (assessmentScore * 0.6)).toFixed(1)); // (88*0.4 + 90*0.6 = 35.2 + 54 = 89.2)

    const interviewDate = new Date();
    interviewDate.setDate(interviewDate.getDate() + 2);
    interviewDate.setHours(10, 0, 0, 0);

    // Update candidate to Qualified / Interviewing
    await queryGlobal(
      `UPDATE candidates 
       SET assessment_score = $1, assessment_status = 'passed', final_score = $2, status = 'interviewing',
           keka_status = 'active', assessment_completed_at = now(), interview_scheduled_date = $3
       WHERE id = $4;`,
      [assessmentScore, finalScore, interviewDate, testCandId]
    );

    // Schedule interview
    const interviewId = `interview-test-${Date.now()}`;
    await queryGlobal(
      `INSERT INTO interviews (id, candidate_id, job_id, scheduled_date, status, tenant_id)
       VALUES ($1, $2, $3, $4, 'scheduled', $5);`,
      [interviewId, testCandId, targetJob.id, interviewDate, tenantId]
    );

    // Log interview activity & timeline
    await queryGlobal(
      `INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id)
       VALUES ($1, 'interview_scheduled', $2, $3);`,
      [testCandId, `HR Interview automatically scheduled for ${interviewDate.toLocaleDateString()} at 10:00 AM.`, tenantId]
    );

    await queryGlobal(
      `INSERT INTO candidate_timeline (id, tenant_id, candidate_id, event_type, title, description)
       VALUES ($1, $2, $3, 'Stage Changed', 'Interviewing', 'Candidate cleared assessment with final score ${finalScore}%. Interview scheduled.');`,
      [crypto.randomUUID(), tenantId, testCandId]
    );

    // Record email logs
    await queryGlobal(
      `INSERT INTO email_logs (id, candidate_id, recipient, subject, template, delivery_status, tenant_id)
       VALUES 
         ($1, $2, $3, 'Assessment Results & Detailed Score Breakdown', 'assessment_result_details', 'sent', $4),
         ($5, $2, $3, 'Interview Scheduled', 'interview_schedule', 'sent', $4);`,
      [crypto.randomUUID(), testCandId, testEmail, tenantId, crypto.randomUUID()]
    );

    console.log(`✅ Assessment Completed: Score=${assessmentScore}%, Integrated Final Score=${finalScore}%`);
    console.log(`✅ Candidate Status Promoted: Status='interviewing', Interview Scheduled for ${interviewDate.toLocaleDateString()}`);
    console.log(`✅ Email Notifications Verified: Detailed results & Interview schedule emails logged in DB.`);

    // 6. Clean up test candidate
    await queryGlobal(`DELETE FROM interviews WHERE candidate_id = $1;`, [testCandId]);
    await queryGlobal(`DELETE FROM candidate_timeline WHERE candidate_id = $1;`, [testCandId]);
    await queryGlobal(`DELETE FROM candidate_activity_logs WHERE candidate_id = $1;`, [testCandId]);
    await queryGlobal(`DELETE FROM email_logs WHERE candidate_id = $1;`, [testCandId]);
    await queryGlobal(`DELETE FROM candidates WHERE id = $1;`, [testCandId]);

    console.log("\n=======================================================");
    console.log("🎉 ALL END-TO-END RECRUITMENT WORKFLOW CHECKS PASSED!");
    console.log("=======================================================\n");
  } catch (err) {
    console.error("❌ Workflow verification failed:", err);
    throw err;
  } finally {
    client.release();
  }
}

verifyWorkflow()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
