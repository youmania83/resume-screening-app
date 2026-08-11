// src/scripts/remediatePipelineAndJobs.ts
import dotenv from "dotenv";
dotenv.config();

import crypto from "crypto";
import { pool, query } from "../lib/db.js";
import { syncPipelineStages } from "./syncPipelineStages.js";

export async function remediatePipelineAndJobs() {
  console.log("==========================================================================");
  console.log("🚀 STARTING COMPREHENSIVE PIPELINE, JOBS & ASSESSMENT DATA REMEDIATION");
  console.log("==========================================================================");

  const client = await pool.connect();
  try {
    // 1. Update Database Trigger directly to ensure DB engine integrity is active
    console.log("\n1️⃣ Updating PostgreSQL candidate pipeline integrity trigger...");
    await client.query(`
      CREATE OR REPLACE FUNCTION fn_enforce_candidate_pipeline_integrity()
      RETURNS TRIGGER AS $$
      BEGIN
        -- 1. Automatic Stage Assignment based on score thresholds
        IF NEW.score IS NOT NULL 
           AND NEW.score > 0
           AND COALESCE(NEW.assessment_status, '') != 'passed' 
           AND NEW.interview_scheduled_date IS NULL 
           AND (NEW.keka_status IS NULL OR NEW.keka_status NOT ILIKE '%interview%') THEN
          IF NEW.score >= 80 THEN
            NEW.status := 'shortlisted';
          ELSIF NEW.score >= 60 THEN
            IF NEW.status IS NULL OR NEW.status IN ('applied', 'shortlisted', 'rejected') THEN
              NEW.status := 'Review';
            END IF;
          ELSE
            IF NEW.status IS NULL OR NEW.status IN ('applied', 'shortlisted', 'Review', 'review') THEN
              NEW.status := 'rejected';
            END IF;
          END IF;
        END IF;

        -- 2. Automatic Assessment Token Invalidation Engine Guarantee
        -- Candidates under 80% OR in inactive status can NEVER hold active assessment tokens
        IF (NEW.score IS NULL OR NEW.score < 80 OR NEW.status IN ('rejected', 'Review', 'review', 'under_review', 'hold', 'disqualified', 'archived'))
           AND COALESCE(NEW.assessment_status, '') != 'passed'
           AND (NEW.keka_status IS NULL OR NEW.keka_status NOT ILIKE '%interview%')
           AND NEW.interview_scheduled_date IS NULL THEN
          NEW.assessment_token := NULL;
          NEW.assessment_token_expiry := NULL;
          IF COALESCE(NEW.assessment_status, '') IN ('invited', 'pending') THEN
            NEW.assessment_status := NULL;
          END IF;
          NEW.assessment_invited_at := NULL;
          NEW.assessment_reminder_sent_at := NULL;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_candidate_pipeline_integrity ON candidates;

      CREATE TRIGGER trg_candidate_pipeline_integrity
      BEFORE INSERT OR UPDATE ON candidates
      FOR EACH ROW
      EXECUTE FUNCTION fn_enforce_candidate_pipeline_integrity();
    `);
    console.log("✅ Trigger updated successfully.");

    // 2. Fix candidates with score >= 80% who were falsely marked as rejected
    console.log("\n2️⃣ Restoring candidates with score >= 80% to Shortlisted stage...");
    const restoreRes = await client.query(`
      UPDATE candidates
      SET status = 'shortlisted'
      WHERE score >= 80
        AND status = 'rejected'
        AND COALESCE(assessment_status, '') != 'passed'
        AND interview_scheduled_date IS NULL
        AND (keka_status IS NULL OR keka_status NOT ILIKE '%interview%');
    `);
    console.log(`✅ Restored ${restoreRes.rowCount} candidate(s) with score >= 80% from 'rejected' to 'shortlisted'.`);

    // 3. Run syncPipelineStages to align all candidate stages
    console.log("\n3️⃣ Running pipeline stage sync...");
    await syncPipelineStages();

    // 4. Re-issue assessment tokens for eligible shortlisted candidates (score >= 80%) who lack tokens
    console.log("\n4️⃣ Re-issuing AI Assessment tokens for eligible shortlisted candidates (score >= 80%)...");
    const eligibleRes = await client.query(`
      SELECT id, name, email, score, status, assessment_token
      FROM candidates
      WHERE score >= 80
        AND status IN ('shortlisted', 'qualified', 'interviewing')
        AND (assessment_token IS NULL OR assessment_token = '')
        AND COALESCE(assessment_status, '') != 'passed';
    `);

    console.log(`Found ${eligibleRes.rowCount} eligible candidate(s) missing assessment tokens.`);
    let tokenCount = 0;
    for (const c of eligibleRes.rows) {
      const newToken = crypto.randomBytes(16).toString("hex");
      const expiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      await client.query(`
        UPDATE candidates
        SET assessment_token = $1,
            assessment_token_expiry = $2,
            assessment_status = COALESCE(assessment_status, 'pending')
        WHERE id = $3;
      `, [newToken, expiry, c.id]);
      tokenCount++;
    }
    console.log(`✅ Re-issued assessment tokens to ${tokenCount} candidate(s).`);

    // 5. Deduplicate Job Opening Rows and Re-map Candidates
    console.log("\n5️⃣ Deduplicating job openings and re-mapping candidate job references...");
    const dupJobs = await client.query(`
      SELECT LOWER(TRIM(title)) as norm_title, array_agg(id ORDER BY created_at DESC) as job_ids
      FROM jobs
      GROUP BY LOWER(TRIM(title))
      HAVING count(*) > 1;
    `);

    let remappedCandidates = 0;
    let closedDupJobs = 0;

    for (const row of dupJobs.rows) {
      const primaryJobId = row.job_ids[0]; // Keep the most recent job record as primary
      const duplicateJobIds = row.job_ids.slice(1);

      console.log(`  Consolidating job "${row.norm_title}": Primary=${primaryJobId}, Duplicates=[${duplicateJobIds.join(", ")}]`);

      // Remap candidate job_id references
      const candRemap = await client.query(`
        UPDATE candidates
        SET job_id = $1
        WHERE job_id = ANY($2::varchar[]);
      `, [primaryJobId, duplicateJobIds]);
      remappedCandidates += candRemap.rowCount || 0;

      // Remap other entity references
      await client.query(`UPDATE assessments SET job_id = $1 WHERE job_id = ANY($2::varchar[]);`, [primaryJobId, duplicateJobIds]).catch(() => {});
      await client.query(`UPDATE interviews SET job_id = $1 WHERE job_id = ANY($2::varchar[]);`, [primaryJobId, duplicateJobIds]).catch(() => {});
      await client.query(`UPDATE applications SET job_id = $1 WHERE job_id = ANY($2::varchar[]);`, [primaryJobId, duplicateJobIds]).catch(() => {});
      await client.query(`UPDATE client_submissions SET job_id = $1 WHERE job_id = ANY($2::varchar[]);`, [primaryJobId, duplicateJobIds]).catch(() => {});
      await client.query(`DELETE FROM candidate_job_matches WHERE job_id = ANY($1::varchar[]);`, [duplicateJobIds]).catch(() => {});

      // Mark duplicate jobs as removed
      const closeRes = await client.query(`
        UPDATE jobs
        SET status = 'closed', sync_status = 'removed'
        WHERE id = ANY($1::varchar[]);
      `, [duplicateJobIds]);
      closedDupJobs += closeRes.rowCount || 0;
    }

    console.log(`✅ Job consolidation completed. Remapped ${remappedCandidates} candidate reference(s), archived ${closedDupJobs} duplicate job(s).`);

    // 6. Summary Verification
    const stageSummary = await client.query(`
      SELECT status, count(*) as count
      FROM candidates
      GROUP BY status
      ORDER BY count DESC;
    `);
    console.log("\n==========================================================================");
    console.log("📊 REMEDIATION COMPLETE — NEW CANDIDATE STAGE BREAKDOWN:");
    console.table(stageSummary.rows);
    console.log("==========================================================================");

  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  remediatePipelineAndJobs().then(() => {
    console.log("🎉 Remediation script finished successfully.");
    process.exit(0);
  }).catch(err => {
    console.error("❌ Remediation script failed:", err);
    process.exit(1);
  });
}
