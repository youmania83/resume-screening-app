// src/test/remapAllCandidateRoles.ts
import dotenv from "dotenv";
dotenv.config();

import { queryGlobal } from "../lib/tenantDb.js";
import { inferCandidateRole, isGenericRoleTitle } from "../lib/roleInference.js";

async function runRemap() {
  console.log("🚀 Starting candidate job role remapping and auto-matching script...");

  // 1. Fetch active jobs
  const jobsRes = await queryGlobal(`SELECT id, title, description, location, experience_required FROM jobs;`);
  const activeJobs = jobsRes.rows;
  console.log(`📋 Found ${activeJobs.length} active jobs in the database.`);

  // 2. Fetch candidates
  const candRes = await queryGlobal(
    `SELECT id, name, role, skills, experience_years, job_id, score, match_percent, recommendation, education FROM candidates;`
  );
  const candidates = candRes.rows;
  console.log(`👤 Found ${candidates.length} total candidates in the database.`);

  let remappedCount = 0;
  let matchedToJobCount = 0;
  let roleInferredCount = 0;

  for (const c of candidates) {
    let bestJob: any = null;
    let highestScore = 0;
    let matchedSkills: string[] = [];
    let missingSkills: string[] = [];

    const candSkills: string[] = Array.isArray(c.skills) ? c.skills : [];
    const expYears = Number(c.experience_years) || 0;

    if (activeJobs.length > 0) {
      for (const job of activeJobs) {
        const descLower = (job.description || "").toLowerCase();
        const titleLower = (job.title || "").toLowerCase();
        const jMatched: string[] = [];
        const jMissing: string[] = [];

        for (const s of candSkills) {
          const sLower = s.toLowerCase().trim();
          if (!sLower) continue;
          if (descLower.includes(sLower) || titleLower.includes(sLower)) {
            jMatched.push(s);
          } else {
            jMissing.push(s);
          }
        }

        if (jMatched.length === 0) continue;

        const skillRatio = candSkills.length > 0 ? (jMatched.length / candSkills.length) : 0;
        let score = Math.round(skillRatio * 70);

        if (c.role && !isGenericRoleTitle(c.role)) {
          const rLower = c.role.toLowerCase();
          if (titleLower.includes(rLower) || rLower.includes(titleLower)) {
            score += 15;
          }
        }

        if (job.experience_required) {
          const reqExp = parseInt(job.experience_required.replace(/[^0-9]/g, ""), 10);
          if (!isNaN(reqExp) && expYears >= reqExp) {
            score += 15;
          }
        }

        score = Math.min(100, score);

        if (score > highestScore && jMatched.length > 0) {
          highestScore = score;
          bestJob = job;
          matchedSkills = jMatched;
          missingSkills = jMissing;
        }
      }
    }

    if (bestJob && highestScore >= 50 && matchedSkills.length > 0) {
      await queryGlobal(
        `UPDATE candidates 
         SET job_id = $1, 
             role = $2, 
             score = $3, 
             match_percent = $3,
             matched_skills = $4,
             missing_skills = $5,
             last_synced_at = NOW()
         WHERE id = $6;`,
        [bestJob.id, bestJob.title, highestScore, matchedSkills, missingSkills, c.id]
      );
      console.log(`  ✅ Matched candidate "${c.name}" -> Active Job: "${bestJob.title}" (Score: ${highestScore}%)`);
      remappedCount++;
      matchedToJobCount++;
    } else {
      if (isGenericRoleTitle(c.role) || !c.role) {
        const suitableRole = inferCandidateRole(c);
        await queryGlobal(
          `UPDATE candidates 
           SET role = $1, 
               job_id = NULL,
               last_synced_at = NOW()
           WHERE id = $2;`,
          [suitableRole, c.id]
        );
        console.log(`  ℹ️ Candidate "${c.name}" (unmapped to active jobs) -> Inferred Resume Role: "${suitableRole}"`);
        remappedCount++;
        roleInferredCount++;
      } else {
        console.log(`  ✓ Candidate "${c.name}" already has clean role: "${c.role}"`);
      }
    }
  }

  console.log(`\n🎉 Remapping Complete! Remapped ${remappedCount} candidates (${matchedToJobCount} matched to active jobs, ${roleInferredCount} roles inferred from resumes).`);
  process.exit(0);
}

runRemap().catch((err) => {
  console.error("❌ Remap script error:", err);
  process.exit(1);
});
