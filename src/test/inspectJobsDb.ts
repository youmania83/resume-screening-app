// src/test/inspectJobsDb.ts
import dotenv from "dotenv";
dotenv.config();

import { queryGlobal } from "../lib/tenantDb.js";

async function main() {
  console.log("🔍 Inspecting JOBS table in PostgreSQL...");

  const res = await queryGlobal(`SELECT id, title, department, location, experience_required, sync_status, source_system, jd FROM jobs LIMIT 20;`);
  console.log(`Found ${res.rowCount} jobs in database.`);

  for (const j of res.rows) {
    console.log(`- Job ID: ${j.id} | Title: "${j.title}" | Dept: "${j.department}" | Loc: "${j.location}" | Exp: "${j.experience_required}" | Source: "${j.source_system}" | Sync: "${j.sync_status}"`);
    if (j.jd) {
      const parsed = typeof j.jd === "string" ? JSON.parse(j.jd) : j.jd;
      console.log(`  Parsed JD Title: "${parsed?.title}", Dept: "${parsed?.department}", Loc: "${parsed?.location}"`);
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
