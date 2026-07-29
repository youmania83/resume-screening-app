// src/test/verify30MinAutonomousSync.ts
import dotenv from "dotenv";
dotenv.config();
import { AutonomousRecruitmentService } from "../services/AutonomousRecruitmentService.js";
import { canSendEmailToCandidate, recordEmailLog } from "../lib/email.js";
import { queryGlobal } from "../lib/tenantDb.js";

async function main() {
  console.log("\n=======================================================");
  console.log("🧪 VERIFYING 30-MINUTE AUTONOMOUS SYNC & ANTI-SPAM GUARDS");
  console.log("=======================================================\n");

  // 1. Run Autonomous 30-Min Cycle
  console.log("Step 1: Running Autonomous 30-Minute Recruitment Cycle...");
  const result = await AutonomousRecruitmentService.run30MinCycle();
  console.log(`✅ Autonomous 30-Min Cycle Executed Cleanly! Result:`, result);

  // 2. Test Anti-Spam Rate Limiter (Max 5 emails cap)
  console.log("\nStep 2: Testing Anti-Spam & Rate Limiting Hard Cap (Max 5 Emails per Candidate)...");
  const testEmail = `antispam.test.${Date.now()}@example.com`;
  const testCandId = `cand-antispam-${Date.now()}`;

  // Log 5 emails for test candidate
  for (let i = 1; i <= 5; i++) {
    await recordEmailLog(testCandId, testEmail, `Test Email ${i}`, `template_${i}`, "87b949cb-2c0d-44ca-a6f5-a025ec43e6a5");
  }

  // Attempt to check if 6th email is allowed
  const checkResult = await canSendEmailToCandidate(testEmail, "assessment_invitation", testCandId);
  console.log(`- Check 6th Email Permission for ${testEmail}:`, checkResult);

  if (checkResult.canSend === false && checkResult.reason?.includes("Max email limit reached")) {
    console.log("✅ VERIFIED: Hard cap of 5 emails total per candidate is strictly enforced!");
  } else {
    throw new Error("❌ FAIL: Anti-spam hard cap allowed > 5 emails!");
  }

  // Clean up test email logs
  await queryGlobal(`DELETE FROM email_logs WHERE recipient = $1;`, [testEmail]);
  console.log("\n=======================================================");
  console.log("🎉 ALL AUTONOMOUS SYNC & ANTI-SPAM CHECKS PASSED!");
  console.log("=======================================================\n");
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
