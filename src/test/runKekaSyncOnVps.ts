// src/test/runKekaSyncOnVps.ts
import dotenv from "dotenv";
dotenv.config();

import { queryGlobal } from "../lib/tenantDb.js";
import { KekaCareersSyncService } from "../services/KekaCareersSyncService.js";

async function main() {
  console.log("🧹 [1/3] Purging invalid/dummy 'Not Specified' jobs from database...");

  const deleteRes = await queryGlobal(
    `DELETE FROM jobs 
     WHERE title = 'Not Specified' 
        OR title = 'Not specified' 
        OR title IS NULL 
        OR LOWER(title) LIKE '%not specified%';`
  );
  console.log(`✅ Deleted ${deleteRes.rowCount} dummy 'Not Specified' jobs from PostgreSQL.`);

  console.log("🔄 [2/3] Triggering Keka Careers active jobs synchronization...");
  const result = await KekaCareersSyncService.syncActiveJobs();
  console.log(`✅ Keka Sync Result: Success=${result.success}, SyncedCount=${result.syncedCount}, Errors=${JSON.stringify(result.errors)}`);

  console.log("📋 [3/3] Fetching top 20 valid active jobs from database...");
  const jobsRes = await queryGlobal(
    `SELECT id, title, department, location, experience_required, source_system, created_at 
     FROM jobs 
     WHERE title IS NOT NULL AND title != 'Not Specified'
     ORDER BY created_at DESC 
     LIMIT 20;`
  );

  console.log(`Found ${jobsRes.rowCount} active jobs in PostgreSQL:`);
  for (const j of jobsRes.rows) {
    console.log(`- [${j.source_system || 'Manual'}] "${j.title}" | Dept: "${j.department}" | Loc: "${j.location}" | Exp: "${j.experience_required}"`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error("❌ Error in Keka Sync runner:", err);
  process.exit(1);
});
