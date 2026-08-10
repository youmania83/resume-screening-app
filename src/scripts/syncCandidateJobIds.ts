// src/scripts/syncCandidateJobIds.ts
import { query } from "../lib/db.js";

export async function syncCandidateJobIds() {
  console.log("=== Syncing candidates.job_id to match jobs.id ===");

  // 1. Link candidates by exact job_code in role or job_id
  const resCode = await query(`
    UPDATE candidates c
    SET job_id = j.id
    FROM jobs j
    WHERE j.job_code IS NOT NULL 
      AND j.job_code != ''
      AND (c.job_id = j.job_code OR c.role ILIKE '%' || j.job_code || '%')
      AND c.job_id != j.id;
  `);
  console.log(`Updated candidates by job_code match: ${resCode.rowCount}`);

  // 2. Link candidates by external_id match
  const resExt = await query(`
    UPDATE candidates c
    SET job_id = j.id
    FROM jobs j
    WHERE c.job_id = j.external_id
      AND c.job_id != j.id;
  `);
  console.log(`Updated candidates by external_id match: ${resExt.rowCount}`);

  // 3. Link candidates by matching role title
  const resRole = await query(`
    UPDATE candidates c
    SET job_id = j.id
    FROM jobs j
    WHERE LOWER(TRIM(c.role)) = LOWER(TRIM(j.title))
      AND (c.job_id IS NULL OR c.job_id != j.id);
  `);
  console.log(`Updated candidates by matching role title: ${resRole.rowCount}`);

  // Verification breakdown
  const summary = await query(`
    SELECT j.title, COUNT(c.id)::int as candidates_count
    FROM jobs j
    JOIN candidates c ON c.job_id = j.id
    GROUP BY j.title
    ORDER BY candidates_count DESC;
  `);
  console.log("Top jobs with linked candidates:", summary.rows);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  syncCandidateJobIds().then(() => process.exit(0)).catch(e => {
    console.error("Job link sync failed:", e);
    process.exit(1);
  });
}
