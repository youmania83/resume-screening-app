// src/scripts/remediateExperienceDiscrepancies.ts
import dotenv from "dotenv";
dotenv.config();

import { queryGlobal } from "../lib/tenantDb.js";
import { reconcileExperienceData } from "../lib/experienceNormalizer.js";

async function main() {
  console.log("🔍 [Remediation] Querying ALL candidate records across database...");

  const result = await queryGlobal(
    `SELECT id, name, email, role, experience_years, recommendation, strengths, experience_match, weaknesses, skills
     FROM candidates;`
  );

  console.log(`========================================`);
  console.log(`📋 Total candidates found: ${result.rowCount}`);
  console.log(`========================================`);

  let updatedCount = 0;

  for (const c of result.rows) {
    const rawExp = Number(c.experience_years) || 0;
    const strengths = Array.isArray(c.strengths) ? c.strengths : [];

    const reconciled = reconcileExperienceData({
      experienceYears: rawExp,
      recommendation: c.recommendation || "",
      strengths: strengths,
      experienceMatch: c.experience_match || "",
      role: c.role || ""
    });

    const expChanged = reconciled.experienceYears !== rawExp;
    const matchChanged = reconciled.experienceMatch !== (c.experience_match || "");

    if (expChanged || matchChanged) {
      console.log(`----------------------------------------`);
      console.log(`✨ Remediating Candidate [${c.name}] (${c.id}):`);
      console.log(`   - Experience Years: ${rawExp} -> ${reconciled.experienceYears}`);
      console.log(`   - Experience Match: "${c.experience_match || ""}" -> "${reconciled.experienceMatch}"`);

      await queryGlobal(
        `UPDATE candidates
         SET experience_years = $1,
             experience_match = $2,
             strengths = $3
         WHERE id = $4;`,
        [
          reconciled.experienceYears,
          reconciled.experienceMatch,
          reconciled.strengths,
          c.id
        ]
      );

      updatedCount++;
    }
  }

  console.log(`========================================`);
  console.log(`🎉 Remediation Complete! Updated ${updatedCount} / ${result.rowCount} candidate records in live database.`);
  console.log(`========================================`);

  process.exit(0);
}

main().catch(err => {
  console.error("❌ Remediation Failed:", err);
  process.exit(1);
});
