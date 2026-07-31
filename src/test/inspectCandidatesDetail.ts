// src/test/inspectCandidatesDetail.ts
import dotenv from "dotenv";
dotenv.config();

import pg from "pg";

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  console.log("🔍 Connecting with SSL to DB...");
  const res = await pool.query(
    `SELECT id, name, email, phone, role, score, skills, matched_skills, missing_skills, job_id, created_at 
     FROM candidates 
     ORDER BY created_at DESC;`
  );
  console.log(`========================================`);
  console.log(`📋 Total candidates in DB: ${res.rowCount}`);
  console.log(`========================================`);
  for (const c of res.rows) {
    console.log(`----------------------------------------`);
    console.log(`ID: ${c.id}`);
    console.log(`Name: "${c.name}"`);
    console.log(`Email: "${c.email}"`);
    console.log(`Phone: "${c.phone}"`);
    console.log(`Role: "${c.role}"`);
    console.log(`Score: ${c.score}`);
    console.log(`Skills: ${JSON.stringify(c.skills || [])}`);
    console.log(`Matched Skills: ${JSON.stringify(c.matched_skills || [])}`);
    console.log(`Missing Skills: ${JSON.stringify(c.missing_skills || [])}`);
    console.log(`Job ID: ${c.job_id}`);
    console.log(`Created At: ${c.created_at}`);
  }
  process.exit(0);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
