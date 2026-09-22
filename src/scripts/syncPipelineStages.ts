// src/scripts/syncPipelineStages.ts
import { query } from "../lib/db.js";
import { isCandidateEligibleForShortlisting } from "../lib/scoreCalculator.js";
import { ACTIVE_JOB_SQL } from "../lib/appConfig.js";

export async function syncPipelineStages() {
  console.log("=== Checking candidate pipeline stage breakdown ===");

  // 1. Initial stage routing ONLY for brand-new unscreened candidates (status NULL or 'applied') that now have a score
  const candidatesToRoute = await query(`
    SELECT c.id, c.name, c.role, c.score, c.skills, c.experience_years, c.education,
           j.title as job_title, j.experience_required, j.description as job_desc
    FROM candidates c
    LEFT JOIN jobs j ON c.job_id = j.id AND ${ACTIVE_JOB_SQL}
    WHERE (c.status IS NULL OR LOWER(c.status) = 'applied')
      AND c.score > 0;
  `);

  let shortlistedCount = 0;
  let reviewCount = 0;
  let rejectedCount = 0;

  for (const cand of candidatesToRoute.rows) {
    if (cand.score >= 80 && cand.job_title) {
      const elig = isCandidateEligibleForShortlisting(
        {
          score: cand.score,
          experienceYears: cand.experience_years,
          skills: cand.skills,
          role: cand.role,
          education: cand.education
        },
        {
          title: cand.job_title,
          experience_required: cand.experience_required,
          description: cand.job_desc
        }
      );

      if (elig.eligible) {
        await query(`UPDATE candidates SET status = 'shortlisted' WHERE id = $1;`, [cand.id]);
        shortlistedCount++;
      } else {
        await query(`UPDATE candidates SET status = 'Review' WHERE id = $1;`, [cand.id]);
        reviewCount++;
      }
    } else if (cand.score >= 60) {
      await query(`UPDATE candidates SET status = 'Review' WHERE id = $1;`, [cand.id]);
      reviewCount++;
    } else {
      await query(`UPDATE candidates SET status = 'rejected' WHERE id = $1;`, [cand.id]);
      rejectedCount++;
    }
  }

  console.log(`Routed candidates: ${shortlistedCount} shortlisted, ${reviewCount} review, ${rejectedCount} rejected.`);
  const breakdown = await query("SELECT status, count(*) FROM candidates GROUP BY status;");
  console.log("Current Stage Breakdown in DB:", breakdown.rows);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  syncPipelineStages().then(() => process.exit(0)).catch(e => {
    console.error("Pipeline stage sync failed:", e);
    process.exit(1);
  });
}
