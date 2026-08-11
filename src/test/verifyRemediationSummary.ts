// src/test/verifyRemediationSummary.ts
import dotenv from "dotenv";
dotenv.config();
import { queryGlobal } from "../lib/tenantDb.js";

async function main() {
  const [tokensRes, attemptsRes, statusRes] = await Promise.all([
    queryGlobal(`
      SELECT COUNT(*)::int as active_tokens,
             COUNT(CASE WHEN assessment_token_expiry > NOW() THEN 1 END)::int as valid_unexpired_tokens
      FROM candidates
      WHERE assessment_token IS NOT NULL AND assessment_token != '';
    `),
    queryGlobal(`
      SELECT status, COUNT(*)::int as count FROM assessment_attempts GROUP BY status;
    `),
    queryGlobal(`
      SELECT status, COUNT(*)::int as count FROM candidates GROUP BY status ORDER BY COUNT(*) DESC;
    `)
  ]);

  console.log("=== CANDIDATES WITH ASSESSMENT TOKENS ===");
  console.table(tokensRes.rows);

  console.log("=== ASSESSMENT ATTEMPTS ===");
  console.table(attemptsRes.rows);

  console.log("=== CANDIDATE STAGE DISTRIBUTION ===");
  console.table(statusRes.rows);

  process.exit(0);
}
main();
