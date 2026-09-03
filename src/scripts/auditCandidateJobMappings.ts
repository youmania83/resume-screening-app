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

      // Candidate is mapped to a job — let's verify skill intersection
      const jobText = `${c.job_title || ""} ${c.job_desc || ""}`.toLowerCase();
      const realMatches = skills.filter(s => s && jobText.includes(s.toLowerCase().trim()));

      if (realMatches.length === 0) {
        mismatches.push({
          id: c.id,
          name: c.name,
          email: c.email,
          mappedJob: c.job_title || c.role,
          score: c.score,
          matchPercent: c.match_percent,
          candidateSkills: skills.slice(0, 8),
          matchedSkillsInDb: matchedSkills,
          realMatchingSkills: realMatches,
          recommendedRole: inferCandidateRole(c)
        });
      } else {
        correctlyMatched.push({
          name: c.name,
          job: c.job_title,
          matchedCount: realMatches.length,
          score: c.score
        });
      }
    }

    console.log("==========================================================================");
    console.log(`🚨 MISMATCHED CANDIDATES FOUND: ${mismatches.length} (Candidates mapped to jobs with 0 matching skills)`);
    console.log("==========================================================================");

    mismatches.forEach((m, idx) => {
      console.log(`\n[${idx + 1}] Candidate: ${m.name} (${m.email})`);
      console.log(`    Mapped Job: "${m.mappedJob}" | Score: ${m.score}% | Match Percent: ${m.matchPercent}%`);
      console.log(`    Candidate Skills: [${m.candidateSkills.join(", ")}]`);
      console.log(`    DB Matched Skills: [${m.matchedSkillsInDb.join(", ")}]`);
      console.log(`    Real Matching Skills with Job: [${m.realMatchingSkills.join(", ")}] (0 MATCH)`);
      console.log(`    👉 Recommended Inferred Role: "${m.recommendedRole}"`);
    });

    console.log("\n==========================================================================");
    console.log(`✅ CANDIDATES WITH REAL SKILL MATCHES: ${correctlyMatched.length}`);
    console.log(`ℹ️  UNASSIGNED / GENERAL CANDIDATES: ${unassignedCandidates.length}`);
    console.log("==========================================================================");

    process.exit(0);
  } catch (err: any) {
    console.error("❌ [Audit Error]:", err.message);
    process.exit(1);
  }
}

auditCandidateJobMappings();
