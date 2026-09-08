// src/scripts/cleanupMockJobs.ts
//
// One-shot cleanup script: identifies and closes all mock/fake jobs that were
// created by the MockEmailProvider, then unlinks the candidates who were
// incorrectly assigned to those fake jobs.
//
// What is a "mock job"?
//   - external_id starts with 'mock-email-'        (created by MockEmailProvider JD emails)
//   - source_system = 'mock'                        (explicitly tagged)
//   - title IN ('React Architect', 'Python / AI Engineer', 'Python Developer')
//     WITH source_system = 'Email' AND location = 'New York City'
//     (the exact fake titles the mock JD email injects)
//
// Candidate cleanup:
//   - Candidates whose job_id maps to a mock job are unlinked (job_id = NULL)
//   - Their status is reset to 'applied' so HR can re-assign them manually
//   - assessment_token and assessment_invited_at are cleared so no orphaned
//     assessment emails go out

import dotenv from "dotenv";
dotenv.config();

import { queryGlobal } from "../lib/tenantDb.js";

const MOCK_TITLES = [
  "React Architect",
  "Python / AI Engineer",
  "Python Developer",   // from mock resume email subject line
  "Product Manager",    // from mock email-3 (Bruce Wayne)
];

async function main() {
  console.log("\n🧹 [Mock Job Cleanup] Starting...\n");

  // ─── Step 1: Identify all mock jobs ────────────────────────────────────────
  const findRes = await queryGlobal(`
    SELECT id, tenant_id, title, location, source_system, external_id, status, created_at
    FROM jobs
    WHERE
      -- Explicitly mock-tagged
      external_id LIKE 'mock-email-%'
      OR source_system = 'mock'
      -- Known mock titles created by MockEmailProvider JD injection
      OR (
        title = ANY($1)
        AND (
          source_system = 'Email'
          OR external_id LIKE 'mock-%'
          OR location = 'New York City'   -- React Architect mock JD location
        )
      )
    ORDER BY created_at DESC;
  `, [MOCK_TITLES]);

  const mockJobs = findRes.rows;
  console.log(`📋 Found ${mockJobs.length} mock job(s):\n`);
  mockJobs.forEach(j => {
    console.log(`  • [${j.id}] "${j.title}" | source: ${j.source_system || 'N/A'} | ext_id: ${j.external_id || 'N/A'} | status: ${j.status || 'active'}`);
  });

  if (mockJobs.length === 0) {
    console.log("\n✅ No mock jobs found. Database is clean.\n");
    return;
  }

  const mockJobIds = mockJobs.map(j => j.id);

  // ─── Step 2: Find candidates incorrectly linked to mock jobs ───────────────
  const affectedCandidatesRes = await queryGlobal(`
    SELECT id, tenant_id, name, email, role, status, job_id
    FROM candidates
    WHERE job_id = ANY($1)
    ORDER BY created_at DESC;
  `, [mockJobIds]);

  const affected = affectedCandidatesRes.rows;
  console.log(`\n👥 Found ${affected.length} candidate(s) linked to mock jobs:`);
  affected.forEach(c => {
    const mockJob = mockJobs.find(j => j.id === c.job_id);
    console.log(`  • ${c.name || c.email} → job: "${mockJob?.title}" | status: ${c.status}`);
  });

  // ─── Step 3: Unlink candidates from mock jobs ───────────────────────────────
  if (affected.length > 0) {
    await queryGlobal(`
      UPDATE candidates
      SET
        job_id              = NULL,
        status              = 'applied',
        assessment_token    = NULL,
        assessment_token_expiry = NULL,
        assessment_invited_at = NULL,
        assessment_status   = NULL
      WHERE job_id = ANY($1);
    `, [mockJobIds]);

    console.log(`\n🔓 Unlinked ${affected.length} candidate(s) from mock jobs. Status reset to 'applied'.`);
  }

  // ─── Step 4: Also clean up candidate_job_matches for mock jobs ─────────────
  const matchClean = await queryGlobal(`
    DELETE FROM candidate_job_matches WHERE job_id = ANY($1);
  `, [mockJobIds]);
  console.log(`🗑️  Removed ${matchClean.rowCount ?? 0} stale candidate_job_matches entries.`);

  // ─── Step 5: Close (soft-delete) all mock jobs ─────────────────────────────
  await queryGlobal(`
    UPDATE jobs
    SET
      status      = 'closed',
      sync_status = 'removed',
      last_synced_at = NOW()
    WHERE id = ANY($1);
  `, [mockJobIds]);

  console.log(`\n✅ Closed ${mockJobs.length} mock job(s).\n`);
  console.log("─────────────────────────────────────────────────────────");
  console.log("Summary:");
  console.log(`  Mock jobs closed:        ${mockJobs.length}`);
  console.log(`  Candidates unlinked:     ${affected.length}`);
  console.log(`  Match records removed:   ${matchClean.rowCount ?? 0}`);
  console.log("\nAffected candidates are now in 'applied' status with no job assignment.");
  console.log("HR can manually assign them to the correct open positions.\n");
}

main().catch(err => {
  console.error("🚨 [Mock Job Cleanup] Fatal error:", err);
  process.exit(1);
});
