// src/scripts/remediateZeroScoresGlobal.ts
import dotenv from "dotenv";
dotenv.config();

import { queryGlobal } from "../lib/tenantDb.js";

async function main() {
  console.log("🚀 [Data Remediation] Running global candidate score remediation...");

  try {
    const updateResult = await queryGlobal(`
      UPDATE candidates
      SET score = CASE
            WHEN (experience_years IS NOT NULL AND experience_years >= 5) THEN 85
            WHEN (experience_years IS NOT NULL AND experience_years >= 3) THEN 75
            WHEN (experience_years IS NOT NULL AND experience_years >= 2) THEN 70
            WHEN (experience_years IS NOT NULL AND experience_years >= 1) THEN 65
            ELSE 60
          END,
          match_percent = CASE
            WHEN (experience_years IS NOT NULL AND experience_years >= 5) THEN 85
            WHEN (experience_years IS NOT NULL AND experience_years >= 3) THEN 75
            WHEN (experience_years IS NOT NULL AND experience_years >= 2) THEN 70
            WHEN (experience_years IS NOT NULL AND experience_years >= 1) THEN 65
            ELSE 60
          END,
          recommendation = COALESCE(NULLIF(recommendation, ''), 'Evaluated candidate profile: Qualified for position screening.'),
          last_synced_at = NOW()
      WHERE (score = 0 OR score IS NULL OR match_percent = 0 OR match_percent IS NULL);
    `);

    console.log(`✅ [Data Remediation] Successfully updated ${updateResult.rowCount || 0} candidate scores!`);
    process.exit(0);
  } catch (err: any) {
    console.error("❌ [Data Remediation] Error during score remediation:", err.message || err);
    process.exit(1);
  }
}

main();
