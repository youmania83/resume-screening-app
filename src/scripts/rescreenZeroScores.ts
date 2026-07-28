// src/scripts/rescreenZeroScores.ts
import dotenv from "dotenv";
dotenv.config();

import { kekaCandidatesService } from "../integrations/keka/services/candidates.service.js";

async function main() {
  console.log("🚀 [Rescreening] Starting batch rescreening of candidates with score = 0...");
  try {
    await kekaCandidatesService.screenUnscreenedCandidates();
    console.log("✅ [Rescreening] Batch rescreening complete!");
    process.exit(0);
  } catch (err: any) {
    console.error("❌ [Rescreening] Error during rescreening:", err.message || err);
    process.exit(1);
  }
}

main();
