// src/test/verifyProgressRecovery.ts
import { pool } from "../lib/db.js";
import crypto from "crypto";

async function runProgressVerification() {
  console.log("🚀 Starting Progress Recovery & Auto-Save Verification...");

  const uniqueId = `rec-${Date.now()}`;
  let tenantId = "";
  let jobId = "";
  let candidateId = "";
  let assessmentId = "";
  let attemptId = "";
  const token = `token-${uniqueId}`;
  const sessionId = crypto.randomUUID();

  try {
    // 1. Setup Test Data
    console.log("\n1. Creating Test Tenant and Job...");
    tenantId = `tenant-${uniqueId}`;
    await pool.query("INSERT INTO tenants (id, name) VALUES ($1, $2);", [tenantId, `Test Recovery Corp ${uniqueId}`]);

    jobId = `job-${uniqueId}`;
    await pool.query(
      "INSERT INTO jobs (id, tenant_id, title, description) VALUES ($1, $2, $3, $4);",
      [jobId, tenantId, "Test Software Engineer", "React and Node experience required."]
    );

    // Create Assessment
    assessmentId = `assess-${uniqueId}`;
    await pool.query("INSERT INTO assessments (id, tenant_id, job_id, title) VALUES ($1, $2, $3, $4);", [
      assessmentId,
      tenantId,
      jobId,
      "Test Software Engineer Assessment",
    ]);

    // Create Candidate
    candidateId = `cnd-${uniqueId}`;
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 7);
    await pool.query(
      `INSERT INTO candidates (id, tenant_id, name, email, role, score, match_percent, experience_years, status, application_source, job_id, assessment_token, assessment_token_expiry, assessment_status, applied_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15);`,
      [
        candidateId,
        tenantId,
        "John Doe",
        "john.doe.rec@example.com",
        "Test Software Engineer",
        0,
        0,
        0,
        "applied",
        "public_link",
        jobId,
        token,
        expiry,
        "pending",
        "2026-06-23",
      ]
    );

    // 2. Create an Assessment Attempt in 'started' state
    console.log("\n2. Initializing Assessment Attempt...");
    attemptId = `attempt-${uniqueId}`;
    await pool.query(
      `INSERT INTO assessment_attempts (id, tenant_id, candidate_id, assessment_id, status, session_id)
       VALUES ($1, $2, $3, $4, 'started', $5);`,
      [attemptId, tenantId, candidateId, assessmentId, sessionId]
    );
    console.log(`Created attempt: ${attemptId} with session: ${sessionId}`);

    // 3. Simulate Progress Saving (Task 2 endpoint logic)
    console.log("\n3. Simulating Progress Auto-Save (Answers and Index)...");
    const testAnswers = {
      "q-1": "Option B",
      "q-2": "Option D",
    };
    const testQuestionIdx = 2;

    await pool.query(
      `UPDATE assessment_attempts
       SET current_answers = $1, current_question_index = $2
       WHERE candidate_id = $3 AND assessment_id = $4 AND status = 'started';`,
      [JSON.stringify(testAnswers), testQuestionIdx, candidateId, assessmentId]
    );
    console.log("Progress saved successfully.");

    // 4. Verify Progress is loaded correctly
    console.log("\n4. Simulating Progress Retrieval (Candidate re-entry)...");
    const checkAttemptRes = await pool.query(
      `SELECT current_answers, current_question_index FROM assessment_attempts 
       WHERE candidate_id = $1 AND assessment_id = $2 AND status = 'started';`,
      [candidateId, assessmentId]
    );

    if (checkAttemptRes.rowCount === 0) {
      throw new Error("Could not find the saved attempt.");
    }

    const savedAttempt = checkAttemptRes.rows[0];
    const retrievedAnswers = typeof savedAttempt.current_answers === "string"
      ? JSON.parse(savedAttempt.current_answers)
      : savedAttempt.current_answers;
    const retrievedQuestionIndex = savedAttempt.current_question_index;

    console.log("Retrieved Answers:", retrievedAnswers);
    console.log("Retrieved Question Index:", retrievedQuestionIndex);

    if (retrievedAnswers["q-1"] !== "Option B" || retrievedAnswers["q-2"] !== "Option D") {
      throw new Error("Retrieved answers do not match the saved answers!");
    }
    if (retrievedQuestionIndex !== 2) {
      throw new Error(`Expected question index 2, got ${retrievedQuestionIndex}`);
    }

    console.log("✅ Verified: Progress answers and question index successfully auto-saved and restored!");

  } catch (err: any) {
    console.error("\n❌ Recovery Verification Failed:", err.message || err);
    process.exitCode = 1;
  } finally {
    // 5. Cleanup Test Data
    if (tenantId) {
      console.log("\n5. Cleaning up recovery verification database records...");
      await pool.query("DELETE FROM tenants WHERE id = $1;", [tenantId]);
      console.log("Cleanup completed.");
    }
    await pool.end();
  }

  if (process.exitCode !== 1) {
    console.log("\n🎉 Candidate Progress Recovery Verification completed successfully with 0 errors!");
  }
}

runProgressVerification().catch((err) => {
  console.error("Fatal progress verification error:", err);
  process.exit(1);
});
