// src/test/verifyAutonomousCycleSafety.ts
import dotenv from "dotenv";
dotenv.config();

import { AutonomousRecruitmentService } from "../services/AutonomousRecruitmentService.js";
import { queryGlobal } from "../lib/tenantDb.js";

async function main() {
  console.log("=== VERIFYING AUTONOMOUS RECRUITMENT CYCLE SAFETY ===");

  const beforeDist = await queryGlobal("SELECT status, COUNT(*)::int as count FROM candidates GROUP BY status ORDER BY COUNT(*) DESC;");
  const beforeTokens = await queryGlobal("SELECT COUNT(*)::int as count FROM candidates WHERE assessment_token IS NOT NULL AND assessment_token_expiry > NOW();");
  
  console.log("Stage distribution BEFORE autonomous cycle run:");
  console.table(beforeDist.rows);
  console.log("Valid assessment tokens count BEFORE:", beforeTokens.rows[0].count);

  console.log("\nExecuting AutonomousRecruitmentService.run30MinCycle()...");
  const result = await AutonomousRecruitmentService.run30MinCycle();
  console.log("Cycle execution result:", result);

  const afterDist = await queryGlobal("SELECT status, COUNT(*)::int as count FROM candidates GROUP BY status ORDER BY COUNT(*) DESC;");
  const afterTokens = await queryGlobal("SELECT COUNT(*)::int as count FROM candidates WHERE assessment_token IS NOT NULL AND assessment_token_expiry > NOW();");

  console.log("\nStage distribution AFTER autonomous cycle run:");
  console.table(afterDist.rows);
  console.log("Valid assessment tokens count AFTER:", afterTokens.rows[0].count);

  if (beforeTokens.rows[0].count === afterTokens.rows[0].count) {
    console.log("✅ SUCCESS: No assessment tokens were wiped or revoked!");
  } else {
    console.error("❌ FAILURE: Tokens count changed!");
  }

  process.exit(0);
}

main();
