// src/scripts/syncPipelineStages.ts
import { query } from "../lib/db.js";

export async function syncPipelineStages() {
  console.log("=== Checking candidate pipeline stage breakdown ===");

  // 1. Initial stage routing ONLY for brand-new unscreened candidates (status NULL or 'applied') that now have a score
  const shortRes = await query(`
    UPDATE candidates 
    SET status = 'shortlisted' 
    WHERE (status IS NULL OR status = 'applied')
      AND score >= 80;
  `);
  if (shortRes.rowCount && shortRes.rowCount > 0) {
    console.log(`Routed newly screened candidates to shortlisted (score >= 80): ${shortRes.rowCount}`);
  }

  const revRes = await query(`
    UPDATE candidates 
    SET status = 'Review' 
    WHERE (status IS NULL OR status = 'applied')
      AND score >= 60 AND score < 80;
  `);
  if (revRes.rowCount && revRes.rowCount > 0) {
    console.log(`Routed newly screened candidates to Review (score 60-79): ${revRes.rowCount}`);
  }

  const rejRes = await query(`
    UPDATE candidates 
    SET status = 'rejected' 
    WHERE (status IS NULL OR status = 'applied')
      AND score > 0 AND score < 60;
  `);
  if (rejRes.rowCount && rejRes.rowCount > 0) {
    console.log(`Routed newly screened candidates to rejected (score < 60): ${rejRes.rowCount}`);
  }

  const breakdown = await query("SELECT status, count(*) FROM candidates GROUP BY status;");
  console.log("Current Stage Breakdown in DB:", breakdown.rows);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  syncPipelineStages().then(() => process.exit(0)).catch(e => {
    console.error("Pipeline stage sync failed:", e);
    process.exit(1);
  });
}
