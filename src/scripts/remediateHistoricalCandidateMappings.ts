// src/scripts/remediateHistoricalCandidateMappings.ts
import dotenv from "dotenv";
dotenv.config();

import { queryGlobal } from "../lib/tenantDb.js";
import { inferCandidateRole } from "../lib/roleInference.js";

async function remediateHistoricalMappings() {
  console.log("🚀 [Remediation] Starting in-place non-destructive candidate remapping...\n");

  try {
    // 1. Fetch all active jobs
    const jobsRes = await queryGlobal(`SELECT id, title, description, location, experience_required FROM jobs;`);
    const activeJobs = jobsRes.rows;
    console.log(`📋 Total Active Jobs: ${activeJobs.length}`);

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

    let correctedMatches = 0;
    let unassignedFromIrrelevantJobs = 0;
    let alreadyCorrect = 0;

    for (const c of candidates) {
      const skills: string[] = Array.isArray(c.skills) ? c.skills : [];
      const expYears = Number(c.experience_years) || 0;

      // Check current job match validity
      let currentJobValid = false;
      let currentJobMatches: string[] = [];

      if (c.job_id && (c.job_title || c.job_desc)) {
        const fullJobText = `${c.job_title || ""} ${c.job_desc || ""}`.toLowerCase();
        currentJobMatches = skills.filter(s => s && fullJobText.includes(s.toLowerCase().trim()));
        if (currentJobMatches.length > 0) {
          currentJobValid = true;
        }
      }

      if (currentJobValid) {
        // Candidate has genuine skill match with current job
        const skillRatio = skills.length > 0 ? (currentJobMatches.length / skills.length) : 0;
        let score = Math.round(skillRatio * 70);
        if (expYears >= 5) score += 15;
        else if (expYears >= 2) score += 10;
        if (c.job_title && (c.role || "").toLowerCase().includes(c.job_title.toLowerCase())) score += 15;
        score = Math.min(100, Math.max(50, score));

        await queryGlobal(
          `UPDATE candidates 
           SET matched_skills = $1, 
               score = $2, 
               match_percent = $2, 
               last_synced_at = NOW() 
           WHERE id = $3;`,
          [currentJobMatches, score, c.id]
        );
        alreadyCorrect++;
      } else {
        // Try to see if candidate genuinely matches any other active job
        let bestNewJob: any = null;
        let highestNewScore = 0;
        let bestNewMatchedSkills: string[] = [];

        for (const job of activeJobs) {
          const jobText = `${job.title || ""} ${job.description || ""}`.toLowerCase();
          const jMatched = skills.filter(s => s && jobText.includes(s.toLowerCase().trim()));

          if (jMatched.length === 0) continue;

          const skillRatio = skills.length > 0 ? (jMatched.length / skills.length) : 0;
          let score = Math.round(skillRatio * 70);
          if (expYears >= 5) score += 15;
          else if (expYears >= 2) score += 10;
          score = Math.min(100, score);

          if (score > highestNewScore && jMatched.length > 0) {
            highestNewScore = score;
            bestNewJob = job;
            bestNewMatchedSkills = jMatched;
          }
        }

        if (bestNewJob && highestNewScore >= 50 && bestNewMatchedSkills.length > 0) {
          await queryGlobal(
            `UPDATE candidates 
             SET job_id = $1, 
                 role = $2, 
                 score = $3, 
                 match_percent = $3, 
                 matched_skills = $4, 
                 last_synced_at = NOW() 
             WHERE id = $5;`,
            [bestNewJob.id, bestNewJob.title, highestNewScore, bestNewMatchedSkills, c.id]
          );
          correctedMatches++;
        } else {
          // Zero skill matches with all open jobs: unassign job_id and set role accurately
          const inferredRole = inferCandidateRole(c);
          const realisticScore = Math.min(85, Math.max(45, 50 + (expYears >= 5 ? 20 : expYears >= 2 ? 10 : 0)));

          await queryGlobal(
            `UPDATE candidates 
             SET job_id = NULL, 
                 role = $1, 
                 score = $2, 
                 match_percent = $2, 
                 matched_skills = $4, 
                 missing_skills = $5, 
                 last_synced_at = NOW() 
             WHERE id = $3;`,
            [inferredRole, realisticScore, c.id, [], []]
          );
          unassignedFromIrrelevantJobs++;
        }
      }
    }

    console.log("==========================================================================");
    console.log("🎉 REMEDIATION COMPLETE (Zero Records Deleted)");
    console.log("==========================================================================");
    console.log(`• Total Processed:                     ${candidates.length}`);
    console.log(`• Retained in Valid Jobs with Real Skills: ${alreadyCorrect}`);
    console.log(`• Re-mapped to Genuine Matching Jobs:      ${correctedMatches}`);
    console.log(`• Unassigned from Irrelevant Open Jobs:    ${unassignedFromIrrelevantJobs}`);
    console.log("==========================================================================");

    process.exit(0);
  } catch (err: any) {
    console.error("❌ [Remediation Error]:", err.message);
    process.exit(1);
  }
}

remediateHistoricalMappings();
