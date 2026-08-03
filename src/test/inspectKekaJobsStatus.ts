// src/test/inspectKekaJobsStatus.ts
import dotenv from "dotenv";
dotenv.config();

import { queryGlobal } from "../lib/tenantDb.js";

async function main() {
  console.log("🔍 Inspecting all jobs in live database...");

  const jobsRes = await queryGlobal(`
    SELECT id, title, department, location, status, sync_status, source_system, external_id, created_at, last_synced_at 
    FROM jobs 
    ORDER BY created_at DESC;
  `);

  console.log(`========================================`);
  console.log(`📋 Total jobs in DB: ${jobsRes.rowCount}`);
  console.log(`========================================`);

  for (const j of jobsRes.rows) {
    console.log(`- Job: "${j.title}" | Status: ${j.status} | SyncStatus: ${j.sync_status} | Source: ${j.source_system} | ExtID: ${j.external_id} | LastSynced: ${j.last_synced_at}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
