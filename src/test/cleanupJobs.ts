// src/test/cleanupJobs.ts
import dotenv from "dotenv";
import fetch from "node-fetch";
import { pool } from "../lib/db.js";

dotenv.config();

const KEKA_CAREERS_URL = "https://techsolengineers.keka.com/careers/api/embedjobs/default/active/c03c98cb-5d89-4e5b-9bbc-5ea37249a087";

async function cleanupJobs() {
  console.log("🧹 Starting Job database cleanup...");
  try {
    // 1. Fetch current active jobs from Keka Careers API
    const response = await fetch(KEKA_CAREERS_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch active jobs from Keka. Status: ${response.status}`);
    }

    const rawJobs = (await response.json()) as any[];
    const activeExternalIds = rawJobs.map(job => job.id.toString());
    console.log(`- Retrieved ${activeExternalIds.length} active Job IDs from Keka.`);

    if (activeExternalIds.length === 0) {
      console.log("⚠️ No active jobs returned from Keka. Aborting cleanup to prevent complete database deletion.");
      process.exit(1);
    }

    // 2. Perform the deletion of inactive/old/mock jobs
    console.log("- Running deletion of non-active jobs...");
    const deleteRes = await pool.query(
      `DELETE FROM jobs 
       WHERE external_id NOT IN (${activeExternalIds.map((_, i) => `$${i + 1}`).join(", ")}) 
          OR external_id IS NULL;`,
      activeExternalIds
    );

    console.log(`✅ SUCCESS: Cleaned up ${deleteRes.rowCount} obsolete jobs from the database.`);
    
    // 3. Confirm remaining count
    const remainingRes = await pool.query("SELECT COUNT(*) as count FROM jobs;");
    console.log(`- Current jobs remaining in database: ${remainingRes.rows[0].count}`);

  } catch (err: any) {
    console.error("❌ Cleanup failed:");
    console.error(err.message || err);
  } finally {
    await pool.end();
  }
}

cleanupJobs();
