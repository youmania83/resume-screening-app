// src/scripts/fixCorruptedAndRemapCandidates.ts
import dotenv from "dotenv";
dotenv.config();

import { queryGlobal } from "../lib/tenantDb.js";

async function main() {
  console.log("=== FIXING SOUMEN DAS ===");
  const welderJob = await queryGlobal(
    "SELECT id, title FROM jobs WHERE title = 'Welder' AND status = 'active' LIMIT 1"
  );
  if (welderJob.rows.length > 0) {
    const wId = welderJob.rows[0].id;
    const wTitle = welderJob.rows[0].title;
    console.log(`Found active Welder job: [${wId}] "${wTitle}"`);
    await queryGlobal(
      "UPDATE candidates SET job_id = $1, role = 'Welder' WHERE email ILIKE '%dassoumen%'",
      [wId]
    );
    console.log("✅ Soumen Das successfully remapped to active Welder opening.");
  }

  console.log("\n=== FIXING CORRUPTED/UNREADABLE RESUMES ===");
  const corruptedCandidates = await queryGlobal(`
    SELECT id, name, email, score, status, recommendation, experience_match 
    FROM candidates 
    WHERE (
      recommendation ILIKE '%corrupted%' 
      OR recommendation ILIKE '%unreadable%' 
      OR experience_match ILIKE '%corrupted%' 
      OR experience_match ILIKE '%unreadable%'
    ) AND score > 0
  `);

  console.log(`Found ${corruptedCandidates.rows.length} candidates with unreadable/corrupted resumes holding false scores:`);
  for (const c of corruptedCandidates.rows) {
    console.log(` - Resetting: ${c.name} (${c.email}) | Old Score: ${c.score} | Old Status: ${c.status}`);
    await queryGlobal(`
      UPDATE candidates 
      SET score = 0, 
          match_percent = 0, 
          status = 'Review',
          assessment_token = NULL,
          assessment_token_expiry = NULL,
          assessment_status = NULL
      WHERE id = $1
    `, [c.id]);
  }

  console.log("\n=== VERIFYING FINAL STATE ===");
  const g = await queryGlobal("SELECT name, role, score, status, job_id FROM candidates WHERE email ILIKE '%gagansood%'");
  console.log("Gagan Sood:", g.rows[0]);
  const s = await queryGlobal(`
    SELECT c.name, c.role, c.score, c.status, j.title as job_title 
    FROM candidates c 
    LEFT JOIN jobs j ON c.job_id = j.id 
    WHERE c.email ILIKE '%dassoumen%'
  `);
  console.log("Soumen Das:", s.rows[0]);
  console.log("\n✅ All historical candidate fixes completed.");
}

main().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
