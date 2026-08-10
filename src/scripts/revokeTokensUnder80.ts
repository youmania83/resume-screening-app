// src/scripts/revokeTokensUnder80.ts
import { query } from "../lib/db.js";

export async function revokeTokensUnder80() {
  console.log("=== Revoking assessment tokens for candidates with resume score < 80% ===");

  const res = await query(`
    UPDATE candidates
    SET assessment_token = NULL,
        assessment_token_expiry = NULL,
        assessment_status = NULL,
        assessment_invited_at = NULL
    WHERE (score < 80 OR score IS NULL)
      AND COALESCE(assessment_status, '') != 'passed'
      AND (keka_status IS NULL OR keka_status NOT ILIKE '%interview%')
      AND interview_scheduled_date IS NULL;
  `);

  console.log(`Successfully revoked assessment tokens for ${res.rowCount} candidates scoring under 80%.`);

  const breakdown = await query(`
    SELECT 
      COUNT(CASE WHEN score >= 80 THEN 1 END)::int as shortlisted_80_plus,
      COUNT(CASE WHEN score < 80 THEN 1 END)::int as under_80
    FROM candidates 
    WHERE assessment_token IS NOT NULL;
  `);
  console.log("Updated Candidates with active assessment tokens:", breakdown.rows[0]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  revokeTokensUnder80().then(() => process.exit(0)).catch(e => {
    console.error("Token revocation failed:", e);
    process.exit(1);
  });
}
