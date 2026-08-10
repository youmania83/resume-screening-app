// src/scripts/syncPipelineStages.ts
import { query } from "../lib/db.js";

export async function syncPipelineStages() {
  console.log("=== Updating candidate pipeline stages based on AI score thresholds ===");

  // 1. Top AI scoring candidates (score >= 91) or explicitly scheduled interviews -> Interviewing (13 candidates)
  const intRes = await query(`
    UPDATE candidates 
    SET status = 'interviewing' 
    WHERE score >= 91 OR keka_status ILIKE '%interview%' OR interview_scheduled_date IS NOT NULL;
  `);
  console.log(`Updated interviewing candidates count: ${intRes.rowCount}`);

  // 2. Shortlisted candidates (score >= 75 and score < 91)
  const shortRes = await query(`
    UPDATE candidates 
    SET status = 'shortlisted' 
    WHERE score >= 75 AND score < 91 AND status != 'interviewing' AND (keka_status IS NULL OR keka_status NOT ILIKE '%interview%');
  `);
  console.log(`Updated shortlisted candidates count: ${shortRes.rowCount}`);

  // 3. Under Review candidates (score >= 60 and score < 75)
  const revRes = await query(`
    UPDATE candidates 
    SET status = 'Review' 
    WHERE score >= 60 AND score < 75 AND status != 'interviewing' AND (keka_status IS NULL OR keka_status NOT ILIKE '%interview%');
  `);
  console.log(`Updated review candidates count: ${revRes.rowCount}`);

  // 4. Hold / Rejected / Pool candidates (score < 60)
  const rejRes = await query(`
    UPDATE candidates 
    SET status = 'rejected' 
    WHERE (score < 60 OR score IS NULL) AND status != 'interviewing' AND (keka_status IS NULL OR keka_status NOT ILIKE '%interview%');
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
