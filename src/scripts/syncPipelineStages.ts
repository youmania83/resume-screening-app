// src/scripts/syncPipelineStages.ts
import { query } from "../lib/db.js";

export async function syncPipelineStages() {
  console.log("=== Updating candidate pipeline stages based on AI score thresholds ===");

  // 1. Demote candidates from interviewing back to shortlisted if they haven't passed the online AI assessment and HR didn't explicitly mark them for interview
  const demoteRes = await query(`
    UPDATE candidates
    SET status = 'shortlisted'
    WHERE status = 'interviewing'
      AND COALESCE(assessment_status, 'pending') != 'passed'
      AND (keka_status IS NULL OR keka_status NOT ILIKE '%interview%')
      AND interview_scheduled_date IS NULL;
  `);
  console.log(`Demoted non-assessment-passed candidates from interviewing to shortlisted: ${demoteRes.rowCount}`);

  // 2. INTERVIEWING: ONLY candidates who passed online AI assessment test OR HR marked interviewing in Keka OR HR scheduled interview in portal
  const intRes = await query(`
    UPDATE candidates 
    SET status = 'interviewing' 
    WHERE assessment_status = 'passed' 
       OR keka_status ILIKE '%interview%' 
       OR interview_scheduled_date IS NOT NULL;
  `);
  console.log(`Updated interviewing candidates count: ${intRes.rowCount}`);

  // 3. SHORTLISTED (AI Assessment): Candidates with resume score >= 80% waiting for AI Assessment
  const shortRes = await query(`
    UPDATE candidates 
    SET status = 'shortlisted' 
    WHERE score >= 80 
      AND status != 'interviewing' 
      AND (keka_status IS NULL OR keka_status NOT ILIKE '%interview%') 
      AND interview_scheduled_date IS NULL;
  `);
  console.log(`Updated shortlisted candidates count: ${shortRes.rowCount}`);

  // 4. UNDER REVIEW: Candidates with resume score 60-79%
  const revRes = await query(`
    UPDATE candidates 
    SET status = 'Review' 
    WHERE score >= 60 AND score < 80 
      AND status != 'interviewing' 
      AND (keka_status IS NULL OR keka_status NOT ILIKE '%interview%') 
      AND interview_scheduled_date IS NULL;
  `);
  console.log(`Updated review candidates count: ${revRes.rowCount}`);

  // 5. HOLD / REJECTED: Candidates with resume score < 60%
  const rejRes = await query(`
    UPDATE candidates 
    SET status = 'rejected' 
    WHERE (score < 60 OR score IS NULL) 
      AND status != 'interviewing' 
      AND (keka_status IS NULL OR keka_status NOT ILIKE '%interview%') 
      AND interview_scheduled_date IS NULL;
  `);
  console.log(`Updated rejected candidates count: ${rejRes.rowCount}`);

  const breakdown = await query("SELECT status, count(*) FROM candidates GROUP BY status;");
  console.log("New Stage Breakdown in DB:", breakdown.rows);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  syncPipelineStages().then(() => process.exit(0)).catch(e => {
    console.error("Pipeline stage sync failed:", e);
    process.exit(1);
  });
}
