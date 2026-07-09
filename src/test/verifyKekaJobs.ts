// src/test/verifyKekaJobs.ts
import dotenv from "dotenv";
import { KekaCareersSyncService } from "../services/KekaCareersSyncService.js";

dotenv.config();

async function testKekaJobsSync() {
  console.log("🚀 Testing Keka Careers active jobs sync from external API...");
  try {
    const result = await KekaCareersSyncService.syncActiveJobs();
    console.log("\n📊 Execution Result:");
    console.log(`- Success: ${result.success}`);
    console.log(`- Synced Count: ${result.syncedCount}`);
    console.log(`- Errors: ${result.errors.length}`);
    if (result.errors.length > 0) {
      console.log("- Error List:");
      result.errors.forEach((err, idx) => console.log(`  [${idx + 1}] ${err}`));
    }
  } catch (err: any) {
    console.error("❌ Exception caught during execution:");
    console.error(err.message || err);
  }
}

testKekaJobsSync();
