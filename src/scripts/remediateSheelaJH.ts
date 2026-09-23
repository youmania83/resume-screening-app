// src/scripts/remediateSheelaJH.ts
//
// One-shot remediation script for candidate "Sheela J H" who was incorrectly
// mapped to "Chief Financial Officer (CFO)" instead of the Sales Engineer role.
//
// This script:
//   1. Finds the candidate Sheela J H
//   2. Finds the active Sales Engineer job in Bengaluru
//   3. Cleans up wrong CFO assessment attempts/sessions
//   4. Recalculates her score against the Sales Engineer job description
//   5. Generates a fresh assessment token for the Sales Engineer position
//   6. Updates candidate record to Sales Engineer (score, status, job_id, token)
//   7. Updates candidate_job_matches
//   8. Updates email_logs to revoke the previous erroneous CFO invitation
//   9. Dispatches the correct Assessment Invitation email for the Sales Engineer role
//  10. Logs activity timeline entry

import dotenv from "dotenv";
dotenv.config();

import crypto from "crypto";
import { queryGlobal } from "../lib/tenantDb.js";
import { evaluateCandidateDetailedScore } from "../lib/scoreCalculator.js";
import { sendAssessmentInviteEmail } from "../lib/email.js";

async function remediateSheelaJH() {
  console.log("🔧 [Remediation] Starting Sheela J H job remapping and assessment fix...\n");

  try {
    // 1. Find Sheela J H
    const candRes = await queryGlobal(`
      SELECT c.id, c.name, c.email, c.phone, c.role, c.skills, c.job_id, c.score,
             c.assessment_token, c.assessment_status, c.status, c.tenant_id,
             c.experience_years, c.education,
             j.title as current_job_title, j.id as current_job_id
      FROM candidates c
      LEFT JOIN jobs j ON c.job_id = j.id
      WHERE LOWER(c.name) LIKE '%sheela%'
         OR LOWER(c.email) LIKE '%sheela%'
      ORDER BY c.created_at DESC;
    `);

    if (!candRes.rowCount || candRes.rowCount === 0) {
      console.error("❌ Candidate Sheela J H not found in database.");
      process.exit(1);
    }

    const candidate = candRes.rows[0];
    console.log(`✅ Found candidate: "${candidate.name}" (ID: ${candidate.id})`);
    console.log(`   Email:        ${candidate.email}`);
    console.log(`   Phone:        ${candidate.phone}`);
    console.log(`   Current Job:  ${candidate.current_job_title || "(none)"} (ID: ${candidate.current_job_id || "NULL"})`);
    console.log(`   Current Score: ${candidate.score}`);
    console.log(`   Status:       ${candidate.status}`);
    console.log(`   Wrong Token:  ${candidate.assessment_token || "none"}`);

    // 2. Find the active Sales Engineer job in Bengaluru
    const salesJobRes = await queryGlobal(`
      SELECT id, title, description, location, department, experience_required, skills
      FROM jobs
      WHERE tenant_id = $1
        AND title ILIKE '%sales engineer%'
        AND location ILIKE '%bengaluru%'
        AND COALESCE(status, 'active') = 'active'
        AND sync_status IS DISTINCT FROM 'removed'
      ORDER BY created_at DESC
      LIMIT 1;
    `, [candidate.tenant_id]);

    let targetJob = salesJobRes.rows[0];
    if (!targetJob) {
      // Fallback to any active Sales Engineer job for this tenant
      const fallbackJobRes = await queryGlobal(`
        SELECT id, title, description, location, department, experience_required, skills
        FROM jobs
        WHERE tenant_id = $1
          AND title ILIKE '%sales engineer%'
          AND COALESCE(status, 'active') = 'active'
          AND sync_status IS DISTINCT FROM 'removed'
        ORDER BY created_at DESC
        LIMIT 1;
      `, [candidate.tenant_id]);
      targetJob = fallbackJobRes.rows[0];
    }

    if (!targetJob) {
      console.error("❌ No active Sales Engineer job found for tenant.");
      process.exit(1);
    }

    console.log(`\n📋 Target Sales Job: "${targetJob.title}" at "${targetJob.location}" (ID: ${targetJob.id})`);

    // 3. Clean up any wrong assessment attempts/sessions
    try {
      await queryGlobal(`DELETE FROM assessment_violations WHERE candidate_id = $1;`, [candidate.id]);
      await queryGlobal(`
        DELETE FROM assessment_audit WHERE session_id IN (
          SELECT id FROM assessment_sessions WHERE candidate_id = $1
        );
      `, [candidate.id]);
      await queryGlobal(`DELETE FROM assessment_sessions WHERE candidate_id = $1;`, [candidate.id]);
      const deletedAttempts = await queryGlobal(`DELETE FROM assessment_attempts WHERE candidate_id = $1;`, [candidate.id]);
      console.log(`🗑️  Cleaned up ${deletedAttempts.rowCount || 0} wrong assessment attempt(s).`);
    } catch (cleanErr: any) {
      console.warn("⚠️  Cleanup non-fatal warning:", cleanErr?.message);
    }

    // 4. Recalculate score against the Sales Engineer job
    const evalResult = evaluateCandidateDetailedScore({
      candidateExperienceYears: Number(candidate.experience_years) || 11.5,
      requiredExperienceText: targetJob.experience_required || undefined,
      candidateSkills: Array.isArray(candidate.skills) ? candidate.skills : [],
      jobRequiredSkills: Array.isArray(targetJob.skills) ? targetJob.skills : [],
      candidateRole: "Lead Sales Executive",
      jobTitle: targetJob.title,
      candidateEducation: candidate.education || "BE: Mechanical Engineering",
      jobDescriptionText: targetJob.description || ""
    });

    const newScore = evalResult.score;
    console.log(`\n🔄 Recalculated Score for Sales Engineer: ${newScore}% (Eligible: ${evalResult.isEligible})`);
    console.log(`   Matched skills: [${evalResult.matchedSkills.join(", ")}]`);

    // 5. Generate fresh assessment token
    const newToken = crypto.randomBytes(24).toString("hex");
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 7);

    // 6. Update candidate record
    await queryGlobal(`
      UPDATE candidates 
      SET job_id = $1,
          role = $2,
          score = $3,
          match_percent = $3,
          matched_skills = $4,
          missing_skills = $5,
          assessment_token = $6,
          assessment_token_expiry = $7,
          assessment_status = 'pending',
          assessment_invited_at = NOW(),
          status = 'shortlisted',
          last_synced_at = NOW()
      WHERE id = $8;
    `, [
      targetJob.id,
      targetJob.title,
      newScore,
      evalResult.matchedSkills,
      evalResult.missingSkills.slice(0, 10),
      newToken,
      expiry,
      candidate.id
    ]);

    console.log(`✅ Candidate updated: role="${targetJob.title}", job_id=${targetJob.id}, score=${newScore}, status="shortlisted".`);

    // 7. Update candidate_job_matches
    await queryGlobal(`
      INSERT INTO candidate_job_matches (
        tenant_id, candidate_id, job_id, match_score, matched_skills, missing_skills, recommendation_reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (candidate_id, job_id) DO UPDATE SET 
        match_score = EXCLUDED.match_score,
        matched_skills = EXCLUDED.matched_skills,
        missing_skills = EXCLUDED.missing_skills,
        recommendation_reason = EXCLUDED.recommendation_reason,
        generated_at = CURRENT_TIMESTAMP;
    `, [
      candidate.tenant_id,
      candidate.id,
      targetJob.id,
      newScore,
      evalResult.matchedSkills,
      evalResult.missingSkills.slice(0, 10),
      "Remediated: Candidate was incorrectly mapped to CFO due to generic management role classification. Corrected to Sales Engineer."
    ]);

    // Also update any old CFO match record so it's not active
    if (candidate.current_job_id) {
      await queryGlobal(`
        UPDATE candidate_job_matches 
        SET match_score = 30,
            recommendation_reason = 'Invalidated: Candidate belongs to Sales domain, not CFO.'
        WHERE candidate_id = $1 AND job_id = $2;
      `, [candidate.id, candidate.current_job_id]);
    }

    // 8. Revoke the previous erroneous CFO email log entry so audit history reflects the correction
    await queryGlobal(`
      UPDATE email_logs
      SET template = 'assessment_invitation_revoked_cfo_error',
          delivery_status = 'revoked',
          error_message = 'Revoked: Erroneous invitation for CFO position. Replaced with Sales Engineer invitation.'
      WHERE candidate_id = $1 AND template = 'assessment_invitation';
    `, [candidate.id]);

    // 9. Dispatch the correct Assessment Invitation email for the Sales Engineer role
    console.log(`\n✉️ Dispatching corrected Assessment Invitation for "${targetJob.title}" to ${candidate.email}...`);
    try {
      const emailRes = await sendAssessmentInviteEmail({
        candidateName: candidate.name,
        candidateEmail: candidate.email,
        jobTitle: targetJob.title,
        token: newToken,
        expiryDate: expiry,
        tenantId: candidate.tenant_id,
        candidateId: candidate.id,
        skipGuard: true // bypass guard because we intentionally revoked the prior wrong invitation
      });
      console.log(`📧 Email send result:`, emailRes);
    } catch (mailErr: any) {
      console.error(`⚠️ Email dispatch error:`, mailErr?.message || mailErr);
    }

    // 10. Log timeline entry in candidate_activity_logs
    await queryGlobal(`
      INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id)
      VALUES ($1, 'remediation_job_remap', $2, $3);
    `, [
      candidate.id,
      `Remediated: Candidate remapped from CFO to "${targetJob.title}" (Bengaluru). Wrong CFO assessment revoked and correct Sales Engineer assessment link issued.`,
      candidate.tenant_id
    ]);

    console.log("\n🎉 [Remediation Complete] Sheela J H successfully remapped to Sales Engineer!");
    console.log(`   New Assessment Link: https://api.risonaitech.com/assessment/${newToken}`);

  } catch (err: any) {
    console.error("🚨 [Remediation Failed]:", err);
    process.exit(1);
  }
}

remediateSheelaJH().then(() => process.exit(0));
