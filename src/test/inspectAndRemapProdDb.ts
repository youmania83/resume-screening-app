// src/test/inspectAndRemapProdDb.ts
import dotenv from "dotenv";
dotenv.config();

import { queryGlobal } from "../lib/tenantDb.js";
import { inferCandidateRole, isGenericRoleTitle } from "../lib/roleInference.js";

async function main() {
  console.log("🔍 Inspecting production Supabase/PostgreSQL database...");

  // 1. Fetch all candidates
  const candRes = await queryGlobal(`SELECT id, name, email, role, job_id, skills, experience_years FROM candidates ORDER BY created_at DESC;`);
  console.log(`\n========================================`);
  console.log(`📋 Total candidates in DB: ${candRes.rowCount}`);
  console.log(`========================================`);

  for (const c of candRes.rows) {
    console.log(`- Candidate: "${c.name}" | Email: "${c.email}" | Role: "${c.role}" | Job ID: "${c.job_id}" | Skills: ${JSON.stringify(c.skills || [])}`);
  }

  // 2. Fetch all jobs
  const jobRes = await queryGlobal(`SELECT id, title, description, location FROM jobs ORDER BY created_at DESC;`);
  console.log(`\n========================================`);
  console.log(`💼 Total jobs in DB: ${jobRes.rowCount}`);
  console.log(`========================================`);
  for (const j of jobRes.rows) {
    console.log(`- Job ID: "${j.id}" | Title: "${j.title}" | Location: "${j.location}"`);
  }

  const activeJobs = jobRes.rows;
  const candidates = candRes.rows;

  console.log(`\n========================================`);
  console.log(`🛠️ Executing live DB remapping & role inference...`);
  console.log(`========================================`);

  let remappedCount = 0;

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
          if (descLower.includes(s.toLowerCase()) || titleLower.includes(s.toLowerCase())) {
            jMatched.push(s);
          } else {
            jMissing.push(s);
          }
        }

        let score = candSkills.length > 0 ? Math.round((jMatched.length / candSkills.length) * 80) : 50;

        if (c.role && !isGenericRoleTitle(c.role)) {
          const rLower = c.role.toLowerCase();
          if (titleLower.includes(rLower) || rLower.includes(titleLower)) {
            score += 20;
          }
        }

        if (score > highestScore) {
          highestScore = score;
          bestJob = job;
          matchedSkills = jMatched;
          missingSkills = jMissing;
        }
      }
    }

    let newRole = c.role;
    let newJobId = c.job_id;

    if (bestJob && highestScore >= 40) {
      newJobId = bestJob.id;
      newRole = bestJob.title;
      await queryGlobal(
        `UPDATE candidates 
         SET job_id = $1, 
             role = $2, 
             score = GREATEST(score, $3), 
             match_percent = GREATEST(match_percent, $3),
             matched_skills = $4,
             missing_skills = $5,
             last_synced_at = NOW()
         WHERE id = $6;`,
        [bestJob.id, bestJob.title, highestScore, matchedSkills, missingSkills, c.id]
      );
      console.log(`  ✅ Candidate "${c.name}" -> Matched Active Job: "${bestJob.title}" (Score: ${highestScore}%)`);
      remappedCount++;
    } else if (isGenericRoleTitle(c.role) || !c.role) {
      const suitableRole = inferCandidateRole({
        skills: c.skills,
        experienceYears: c.experience_years,
        currentTitle: c.role,
        name: c.name
      });
      newRole = suitableRole;
      await queryGlobal(
        `UPDATE candidates 
         SET role = $1, 
             last_synced_at = NOW()
         WHERE id = $2;`,
        [suitableRole, c.id]
      );
      console.log(`  ℹ️ Candidate "${c.name}" -> Inferred Suitable Role: "${suitableRole}"`);
      remappedCount++;
    } else {
      console.log(`  ✓ Candidate "${c.name}" already has valid role: "${c.role}"`);
    }
  }

  console.log(`\n🎉 Remapped ${remappedCount} candidates in Supabase database!`);

  // Verify final database candidate roles
  const verifyRes = await queryGlobal(`SELECT name, role, job_id FROM candidates ORDER BY created_at DESC;`);
  console.log(`\n========================================`);
  console.log(`📊 Updated Candidates in Database:`);
  console.log(`========================================`);
  for (const r of verifyRes.rows) {
    console.log(`- Candidate: "${r.name}" -> Role: "${r.role}" (Job ID: ${r.job_id})`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error running script:", err);
  process.exit(1);
});
