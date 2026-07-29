// src/scripts/resetPreJuly29Data.ts
import dotenv from "dotenv";
dotenv.config();
import { queryGlobal } from "../lib/tenantDb.js";
import { pool } from "../lib/db.js";

async function resetPreJuly29Data() {
  const client = await pool.connect();
  try {
    console.log("🚀 Starting database cleanup for records prior to 2026-07-29...");
    await client.query("BEGIN;");

    // Cutoff timestamp: July 29, 2026 00:00:00 UTC / local
    const cutoffDate = "2026-07-29";
    const cutoffTimestamp = "2026-07-29T00:00:00.000Z";

    // 1. Identify candidate IDs to purge
    const candRes = await client.query(
      `SELECT id FROM candidates 
       WHERE created_at < $1::timestamptz 
          OR applied_date < $2;`,
      [cutoffTimestamp, cutoffDate]
    );

    const candidateIds = candRes.rows.map((r: any) => r.id);
    console.log(`Found ${candidateIds.length} candidate(s) created prior to ${cutoffDate}.`);

    // 2. Cascade delete dependent child records for legacy candidates
    if (candidateIds.length > 0) {
      await client.query(`DELETE FROM candidate_job_matches WHERE candidate_id = ANY($1::text[]);`, [candidateIds]);
      await client.query(`DELETE FROM candidate_match_history WHERE candidate_id = ANY($1::text[]);`, [candidateIds]);
      await client.query(`DELETE FROM duplicate_candidates WHERE candidate_id = ANY($1::text[]) OR duplicate_candidate_id = ANY($1::text[]);`, [candidateIds]);
      await client.query(`DELETE FROM candidate_merge_history WHERE primary_candidate_id = ANY($1::text[]);`, [candidateIds]);
      await client.query(`DELETE FROM candidate_notes WHERE candidate_id = ANY($1::text[]);`, [candidateIds]);
      await client.query(`DELETE FROM candidate_tags WHERE candidate_id = ANY($1::text[]);`, [candidateIds]);
      await client.query(`DELETE FROM candidate_timeline WHERE candidate_id = ANY($1::text[]);`, [candidateIds]);
      await client.query(`DELETE FROM candidate_documents WHERE candidate_id = ANY($1::text[]);`, [candidateIds]);
      await client.query(`DELETE FROM candidate_assignments WHERE candidate_id = ANY($1::text[]);`, [candidateIds]);
      await client.query(`DELETE FROM client_submissions WHERE candidate_id = ANY($1::text[]);`, [candidateIds]);
      await client.query(`DELETE FROM candidate_activity_logs WHERE candidate_id = ANY($1::text[]);`, [candidateIds]);
      await client.query(`DELETE FROM applications WHERE candidate_id = ANY($1::text[]);`, [candidateIds]);
      await client.query(`DELETE FROM offers WHERE candidate_id = ANY($1::text[]);`, [candidateIds]);
      await client.query(`DELETE FROM documents WHERE candidate_id = ANY($1::text[]);`, [candidateIds]);
      await client.query(`DELETE FROM email_communication_history WHERE candidate_id = ANY($1::text[]);`, [candidateIds]);
      await client.query(`DELETE FROM email_logs WHERE candidate_id = ANY($1::text[]);`, [candidateIds]);
      await client.query(`DELETE FROM support_tickets WHERE candidate_id = ANY($1::text[]);`, [candidateIds]);

      // Assessment related deletes for these candidates
      await client.query(`DELETE FROM assessment_violations WHERE candidate_id = ANY($1::text[]);`, [candidateIds]);
      await client.query(`DELETE FROM assessment_audit WHERE session_id IN (SELECT id FROM assessment_sessions WHERE candidate_id = ANY($1::text[]));`, [candidateIds]);
      await client.query(`DELETE FROM assessment_sessions WHERE candidate_id = ANY($1::text[]);`, [candidateIds]);
      await client.query(`DELETE FROM assessment_attempts WHERE candidate_id = ANY($1::text[]);`, [candidateIds]);
      await client.query(`DELETE FROM interviews WHERE candidate_id = ANY($1::text[]);`, [candidateIds]);

      // Delete candidate records
      await client.query(`DELETE FROM candidates WHERE id = ANY($1::text[]);`, [candidateIds]);
      console.log(`Deleted ${candidateIds.length} candidate record(s) and associated dependencies.`);
    }

    // 3. Clean up resume_inbox records created before 2026-07-29
    const inboxDelRes = await client.query(
      `DELETE FROM resume_inbox WHERE created_at < $1::timestamptz;`,
      [cutoffTimestamp]
    );
    console.log(`Deleted ${inboxDelRes.rowCount} resume inbox record(s) created prior to ${cutoffDate}.`);

    // 4. Clean up email logs created before 2026-07-29
    const emailDelRes = await client.query(
      `DELETE FROM email_logs WHERE sent_time < $1::timestamptz;`,
      [cutoffTimestamp]
    );
    console.log(`Deleted ${emailDelRes.rowCount} email log record(s) sent prior to ${cutoffDate}.`);

    // 5. Clean up resume_processing_logs created before 2026-07-29
    const procLogsDelRes = await client.query(
      `DELETE FROM resume_processing_logs WHERE created_at < $1::timestamptz;`,
      [cutoffTimestamp]
    );
    console.log(`Deleted ${procLogsDelRes.rowCount} resume processing log record(s) created prior to ${cutoffDate}.`);

    // 6. Reset active_candidates counter in tenant_usage_summary for historical months, retaining job counts
    await client.query(
      `UPDATE tenant_usage_summary 
       SET active_candidates = (SELECT COUNT(*) FROM candidates WHERE tenant_id = tenant_usage_summary.tenant_id);`
    );

    await client.query("COMMIT;");
    console.log("✅ Data reset completed successfully! Only data applied on or after 2026-07-29 will be retained.");
  } catch (err) {
    await client.query("ROLLBACK;");
    console.error("❌ Error during database reset:", err);
    throw err;
  } finally {
    client.release();
  }
}

resetPreJuly29Data()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
