// src/test/verifyAssessmentTokenEndpoint.ts
import dotenv from "dotenv";
dotenv.config();
import { queryGlobal } from "../lib/tenantDb.js";

async function main() {
  const candRes = await queryGlobal(`
    SELECT id, name, email, role, assessment_token, assessment_token_expiry, status
    FROM candidates
    WHERE assessment_token IS NOT NULL AND assessment_token != ''
    LIMIT 3;
  `);

  console.log("=== SAMPLE CANDIDATES WITH ACTIVE ASSESSMENT TOKENS ===");
  console.table(candRes.rows);

  if (candRes.rows.length > 0) {
    const token = candRes.rows[0].assessment_token;
    const testFetch = await queryGlobal(`
      SELECT c.id, c.name, c.email, c.role, c.assessment_token_expiry, j.title as job_title
      FROM candidates c
      LEFT JOIN jobs j ON c.job_id = j.id
      WHERE c.assessment_token = $1;
    `, [token]);
    console.log("=== TOKEN RESOLUTION QUERY FOR CANDIDATE ASSESSMENT PORTAL ===");
    console.table(testFetch.rows);
  }

  process.exit(0);
}
main();
