// src/scripts/reprocessAllCandidatesRoot.ts
import dotenv from "dotenv";
dotenv.config();

import { queryGlobal } from "../lib/tenantDb.js";
import { reconcileExperienceData } from "../lib/experienceNormalizer.js";
import { cleanCandidateName } from "../lib/nameSanitizer.js";
import { resolvePrecisionJobId } from "../lib/jobMapper.js";
import { calculatePrecisionCandidateScore } from "../lib/scoreCalculator.js";
import { ensureNonBlankRemarks } from "../lib/aiEvaluationCache.js";

async function reprocessAllCandidates() {
  console.log("================================================================================");
  console.log("🚀 Starting Root-Level Database Reprocessing & Recalculation for ALL Candidates");
  console.log("================================================================================");

  // Fetch all candidates and joined resume raw text if available
  const candidatesRes = await queryGlobal(`
    SELECT c.id, c.tenant_id, c.name, c.email, c.phone, c.role, c.job_id, c.experience_years, 
           c.recommendation, c.experience_match, c.strengths, c.weaknesses, c.matched_skills, 
           c.missing_skills, c.skills, c.score, c.match_percent, c.first_name, c.last_name,
           rt.raw_text, j.title as job_title, j.location as job_location, j.experience_required as job_experience
    FROM candidates c
    LEFT JOIN resume_inbox ri ON ri.candidate_id = c.id
    LEFT JOIN resume_texts rt ON (rt.batch_id = ri.id OR rt.s3_key = ri.file_name)
    LEFT JOIN jobs j ON j.id = c.job_id
    ORDER BY c.created_at DESC;
  `);

  const totalCandidates = candidatesRes.rowCount || 0;
  console.log(`📋 Total candidates to process: ${totalCandidates}`);

  let updatedCount = 0;
  let expUpdatedCount = 0;
  let nameUpdatedCount = 0;
  let scoreUpdatedCount = 0;
  let jobMapUpdatedCount = 0;

  for (const c of candidatesRes.rows) {
    let modified = false;

    // 1. Clean Candidate Name
    const oldName = c.name || "";
    const cleanName = cleanCandidateName(oldName, c.email, c.raw_text);
    if (cleanName !== oldName) {
      modified = true;
      nameUpdatedCount++;
    }

    // 2. Reconcile Candidate Experience
    const currentExp = typeof c.experience_years === "number" ? c.experience_years : parseFloat(c.experience_years) || 0;
    const reconciled = reconcileExperienceData({
      experienceYears: currentExp,
      recommendation: c.recommendation,
      strengths: Array.isArray(c.strengths) ? c.strengths : [],
      experienceMatch: c.experience_match,
      weaknesses: Array.isArray(c.weaknesses) ? c.weaknesses : [],
      skills: Array.isArray(c.skills) ? c.skills : [],
      role: c.role || c.job_title,
      rawText: c.raw_text
    });

    const newExpYears = reconciled.experienceYears;
    if (newExpYears !== currentExp) {
      modified = true;
      expUpdatedCount++;
    }

    // Ensure Non-Blank Remarks
    const remarks = ensureNonBlankRemarks({
      recommendationReason: reconciled.recommendation,
      strengths: reconciled.strengths,
      experienceMatch: reconciled.experienceMatch,
      skills: c.skills
    }, {
      role: c.role || c.job_title || "Candidate",
      score: c.score || 75,
      experienceYears: newExpYears,
      skills: c.skills
    });

    // 3. Precision Job ID Mapping
    let newJobId = c.job_id;
    if (c.role && c.tenant_id) {
      const mappedJobId = await resolvePrecisionJobId({
        targetJobTitle: c.role,
        targetLocation: c.job_location,
        jobCode: undefined
      });

      if (mappedJobId && mappedJobId !== c.job_id) {
        newJobId = mappedJobId;
        modified = true;
        jobMapUpdatedCount++;
      }
    }

    // 4. Recalculate AI Match Score
    const oldScore = Number(c.score || 0);
    const newScore = calculatePrecisionCandidateScore({
      candidateExperienceYears: newExpYears,
      requiredExperienceText: c.job_experience,
      candidateSkills: c.skills || [],
      jobRequiredSkills: c.matched_skills || [],
      candidateRole: c.role,
      jobTitle: c.job_title,
      baseAiScore: oldScore
    });

    if (newScore !== oldScore) {
      modified = true;
      scoreUpdatedCount++;
    }

    // Update DB if any field changed
    if (modified) {
      updatedCount++;
      await queryGlobal(`
        UPDATE candidates
        SET name = $1,
            experience_years = $2,
            experience_match = $3,
            recommendation = $4,
            strengths = $5,
            score = $6,
            match_percent = $6,
            job_id = $7
        WHERE id = $8;
      `, [
        cleanName,
        newExpYears,
        remarks.experienceMatch,
        remarks.recommendation,
        remarks.strengths,
        newScore,
        newJobId,
        c.id
      ]);
    }
  }

  console.log("================================================================================");
  console.log(`✅ Reprocessing complete!`);
  console.log(`   - Total candidates scanned: ${totalCandidates}`);
  console.log(`   - Total candidates updated: ${updatedCount}`);
  console.log(`   - Experience numbers reconciled: ${expUpdatedCount}`);
  console.log(`   - Candidate names recovered: ${nameUpdatedCount}`);
  console.log(`   - Precision job mappings updated: ${jobMapUpdatedCount}`);
  console.log(`   - AI match scores recalculated: ${scoreUpdatedCount}`);
  console.log("================================================================================");

  process.exit(0);
}

reprocessAllCandidates().catch(err => {
  console.error("🚨 Error during candidate reprocessing:", err);
  process.exit(1);
});
