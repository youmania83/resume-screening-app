// src/scripts/auditCandidateJobMappings.ts
import dotenv from "dotenv";
dotenv.config();

import { queryGlobal } from "../lib/tenantDb.js";
import { inferCandidateRole } from "../lib/roleInference.js";

async function auditCandidateJobMappings() {
  console.log("🔍 [Audit] Scanning database for mismatched candidate-job mappings...\n");

  try {
    // 1. Fetch all active jobs
    const jobsRes = await queryGlobal(`SELECT id, title, description, location, experience_required FROM jobs;`);
    const jobs = jobsRes.rows;
    console.log(`📋 Total Jobs in DB: ${jobs.length}`);

    // 2. Fetch all candidates
    const candRes = await queryGlobal(`
      SELECT c.id, c.name, c.email, c.role, c.skills, c.matched_skills, c.score, c.match_percent, c.experience_years, c.job_id,
             j.title as job_title, j.description as job_desc
      FROM candidates c
      LEFT JOIN jobs j ON c.job_id = j.id
      ORDER BY c.created_at DESC;
    `);
    const candidates = candRes.rows;
    console.log(`👤 Total Candidates in DB: ${candidates.length}\n`);

    const mismatches: any[] = [];
    const correctlyMatched: any[] = [];
    const unassignedCandidates: any[] = [];
    const jobBreakdown: Record<string, { total: number; valid: number; zeroMatch: number; sampleMismatches: any[] }> = {};

    for (const c of candidates) {
      const skills: string[] = Array.isArray(c.skills) ? c.skills : [];
      const matchedSkills: string[] = Array.isArray(c.matched_skills) ? c.matched_skills : [];

      if (!c.job_id) {
        unassignedCandidates.push({
          name: c.name,
          email: c.email,
          role: c.role,
          inferredRole: inferCandidateRole(c),
          score: c.score
        });
        continue;
      }

      const jobTitle = c.job_title || "Unknown Job";
      if (!jobBreakdown[jobTitle]) {
        jobBreakdown[jobTitle] = { total: 0, valid: 0, zeroMatch: 0, sampleMismatches: [] };
      }
      jobBreakdown[jobTitle].total++;

      // Candidate is mapped to a job — verify skill intersection
      const jobText = `${c.job_title || ""} ${c.job_desc || ""}`.toLowerCase();
      const realMatches = skills.filter(s => s && jobText.includes(s.toLowerCase().trim()));

      if (realMatches.length === 0) {
        jobBreakdown[jobTitle].zeroMatch++;
        const mismatchItem = {
          id: c.id,
          name: c.name,
          email: c.email,
          mappedJob: jobTitle,
          score: c.score,
          matchPercent: c.match_percent,
          candidateSkills: skills.slice(0, 6),
          matchedSkillsInDb: matchedSkills.slice(0, 6),
          recommendedRole: inferCandidateRole(c)
        };
        mismatches.push(mismatchItem);
        if (jobBreakdown[jobTitle].sampleMismatches.length < 3) {
          jobBreakdown[jobTitle].sampleMismatches.push(mismatchItem);
        }
      } else {
        jobBreakdown[jobTitle].valid++;
        correctlyMatched.push({
          name: c.name,
          job: c.job_title,
          matchedCount: realMatches.length,
          score: c.score
        });
      }
    }

    console.log("==========================================================================");
    console.log(`📊 AUDIT SUMMARY (Non-destructive check)`);
    console.log("==========================================================================");
    console.log(`Total Candidates in DB:          ${candidates.length}`);
    console.log(`✅ Valid Matches (with real skills): ${correctlyMatched.length} (${Math.round((correctlyMatched.length / candidates.length) * 100)}%)`);
    console.log(`🚨 Zero-Skill Mismatches:        ${mismatches.length} (${Math.round((mismatches.length / candidates.length) * 100)}%)`);
    console.log(`ℹ️  Unassigned Candidates:         ${unassignedCandidates.length}`);

    console.log("\n==========================================================================");
    console.log("📋 BREAKDOWN BY JOB OPENING");
    console.log("==========================================================================");
    Object.entries(jobBreakdown)
      .sort((a, b) => b[1].zeroMatch - a[1].zeroMatch)
      .forEach(([job, stats]) => {
        const mismatchRate = Math.round((stats.zeroMatch / stats.total) * 100);
        console.log(`\n• Job: "${job}" (Total: ${stats.total} candidates)`);
        console.log(`   - Valid Skill Matches: ${stats.valid}`);
        console.log(`   - Zero-Skill Mismatches: ${stats.zeroMatch} (${mismatchRate}%)`);
        if (stats.sampleMismatches.length > 0) {
          console.log(`   - Example Mismatched Profiles:`);
          stats.sampleMismatches.forEach(sm => {
            console.log(`     * ${sm.name} | Score: ${sm.score}% | Skills: [${sm.candidateSkills.join(", ") || "None listed"}] -> Inferred Role: "${sm.recommendedRole}"`);
          });
        }
      });

    console.log("\n==========================================================================");
    console.log("✅ Audit completed. Zero records were modified or deleted.");
    console.log("==========================================================================");

    process.exit(0);
  } catch (err: any) {
    console.error("❌ [Audit Error]:", err.message);
    process.exit(1);
  }
}

auditCandidateJobMappings();
