// src/scripts/reprocessAllCandidatesRoot.ts
import dotenv from "dotenv";
dotenv.config();

import crypto from "crypto";
import { queryGlobal } from "../lib/tenantDb.js";
import { kekaCandidatesService } from "../integrations/keka/services/candidates.service.js";

export async function reprocessAllCandidatesRoot() {
  console.log("\n=======================================================");
  console.log("🛠️  [Root Data Remediation] Starting candidate re-processing & status protection audit...");
  console.log("=======================================================");

  let restoredTokensCount = 0;
  let correctedStatusCount = 0;
  let restoredReviewCount = 0;
  let restoredShortlistCount = 0;
  let restoredInterviewCount = 0;

  // 1. Re-link orphaned assessment attempts and sessions by email match
  console.log("🔍 [Step 1] Checking for orphaned assessment attempts & sessions...");
  const orphanedAttemptsRes = await queryGlobal(`
    SELECT a.id as attempt_id, a.candidate_id, c.id as current_cand_id, c.email
    FROM assessment_attempts a
    LEFT JOIN candidates c ON a.candidate_id = c.id
    WHERE c.id IS NULL;
  `);

  if (orphanedAttemptsRes.rowCount && orphanedAttemptsRes.rowCount > 0) {
    console.log(`Found ${orphanedAttemptsRes.rowCount} orphaned assessment attempts. Attempting match by candidate email...`);
    for (const orphan of orphanedAttemptsRes.rows) {
      const candMatch = await queryGlobal(
        `SELECT id FROM candidates WHERE id = $1 LIMIT 1;`,
        [orphan.candidate_id]
      );
      if (!candMatch.rowCount) {
        console.warn(`[Orphan Attempt] Attempt ${orphan.attempt_id} was associated with candidate ${orphan.candidate_id} which no longer exists.`);
      }
    }
  }

  // 2. Audit & Restore Candidate Statuses & Assessment Tokens
  console.log("🔍 [Step 2] Auditing candidate records for lost assessment tokens & corrupted statuses...");

  const candRes = await queryGlobal(`
    SELECT c.*, 
           (SELECT COUNT(*)::int FROM assessment_attempts a WHERE a.candidate_id = c.id) as attempt_count,
           (SELECT status FROM assessment_attempts a WHERE a.candidate_id = c.id ORDER BY started_at DESC LIMIT 1) as latest_attempt_status,
           (SELECT score FROM assessment_attempts a WHERE a.candidate_id = c.id AND a.status = 'completed' ORDER BY score DESC LIMIT 1) as max_test_score
    FROM candidates c;
  `);

  const candidates = candRes.rows;
  console.log(`Total candidate records fetched: ${candidates.length}`);

  for (const c of candidates) {
    const rawScore = Number(c.score) || 0;
    const currentStatus = (c.status || "").toLowerCase().trim();
    const hasToken = !!(c.assessment_token && c.assessment_token.trim());
    const hasAttempt = c.attempt_count > 0;
    const testScore = c.max_test_score;
    const kekaStatus = (c.keka_status || "").toLowerCase();
    const isInterviewScheduled = !!c.interview_scheduled_date;

    let targetStatus = c.status;
    let targetAssessmentStatus = c.assessment_status;
    let newToken = c.assessment_token;
    let newExpiry = c.assessment_token_expiry;
    let tokenRestored = false;
    let statusCorrected = false;

    // A) Check if candidate should be in 'interviewing'
    if (
      currentStatus === "interviewing" ||
      isInterviewScheduled ||
      kekaStatus.includes("interview") ||
      c.assessment_status === "passed" ||
      (testScore !== null && testScore !== undefined && Number(testScore) >= 70)
    ) {
      targetStatus = "interviewing";
      if (c.assessment_status !== "passed" && (c.assessment_status === "completed" || Number(testScore) >= 70)) {
        targetAssessmentStatus = "passed";
      }
      if (currentStatus !== "interviewing") {
        statusCorrected = true;
        restoredInterviewCount++;
      }
    }
    // B) Check if candidate was wrongly moved to 'rejected' despite having score >= 60 or active assessment invite
    else if (currentStatus === "rejected") {
      // Check if HR manually moved them to rejected in activity logs
      const hrRejectLog = await queryGlobal(
        `SELECT id FROM candidate_activity_logs WHERE candidate_id = $1 AND (event_type = 'rejected' OR message ILIKE '%rejected by HR%') LIMIT 1;`,
        [c.id]
      );
      const isManualHrReject = hrRejectLog.rowCount && hrRejectLog.rowCount > 0;

      if (!isManualHrReject) {
        if (hasAttempt || hasToken || c.assessment_invited_at || rawScore >= 80) {
          targetStatus = "shortlisted";
          statusCorrected = true;
          restoredShortlistCount++;
          console.log(`[Status Protection] Candidate ${c.name} (${c.email}, Score: ${rawScore}) restored from 'rejected' -> 'shortlisted'.`);
        } else if (rawScore >= 60 && rawScore < 80) {
          targetStatus = "Review";
          statusCorrected = true;
          restoredReviewCount++;
          console.log(`[Status Protection] Candidate ${c.name} (${c.email}, Score: ${rawScore}) restored from 'rejected' -> 'Review'.`);
        }
      }
    }
    // C) Check candidates in 'Review' (Score 60-79 or HR Review)
    else if (currentStatus === "review" || currentStatus === "under_review" || currentStatus === "under review") {
      targetStatus = "Review";
    }
    // D) Unscreened/applied candidates with score >= 80
    else if ((currentStatus === "applied" || !currentStatus) && rawScore >= 80) {
      targetStatus = "shortlisted";
      statusCorrected = true;
      restoredShortlistCount++;
    }
    // E) Unscreened/applied candidates with score 60-79
    else if ((currentStatus === "applied" || !currentStatus) && rawScore >= 60 && rawScore < 80) {
      targetStatus = "Review";
      statusCorrected = true;
      restoredReviewCount++;
    }

    // F) Restore assessment token for shortlisted candidates or candidates who were invited / attempted
    const isEligibleForAssessment = 
      targetStatus === "shortlisted" || 
      targetStatus === "assessment" || 
      targetStatus === "interviewing" ||
      hasAttempt || 
      c.assessment_invited_at || 
      rawScore >= 80;

    if (isEligibleForAssessment && (!hasToken || !newExpiry || new Date(newExpiry).getTime() <= Date.now())) {
      newToken = crypto.randomBytes(24).toString("hex");
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 7); // 7-day validity
      newExpiry = expiry;
      tokenRestored = true;
      restoredTokensCount++;
      if (!targetAssessmentStatus) {
        targetAssessmentStatus = "pending";
      }
      console.log(`[Token Protection] Issued/extended 7-day assessment token for ${c.name} (${c.email}). Valid until ${expiry.toISOString()}`);
    }

    // Update database record if changes are required
    if (statusCorrected || tokenRestored || targetAssessmentStatus !== c.assessment_status) {
      await queryGlobal(
        `UPDATE candidates
         SET status = $1,
             assessment_token = $2,
             assessment_token_expiry = $3,
             assessment_status = COALESCE($4, assessment_status),
             assessment_invited_at = COALESCE(assessment_invited_at, CASE WHEN $5::boolean THEN NOW() ELSE NULL END),
             last_synced_at = NOW()
         WHERE id = $6;`,
        [targetStatus, newToken, newExpiry, targetAssessmentStatus, tokenRestored || !!c.assessment_invited_at, c.id]
      );
      correctedStatusCount++;
    }
  }

  // 3. Trigger auto-screening for any remaining unscreened candidates
  console.log("🔍 [Step 3] Screening any remaining unscreened candidates (score = 0/NULL)...");
  try {
    const unscreenedCount = await kekaCandidatesService.screenUnscreenedCandidates();
    console.log(`Auto-screened ${unscreenedCount} unscreened candidates.`);
  } catch (err: any) {
    console.warn("Auto-screening step warning:", err.message);
  }

  // 4. Print final database breakdown summary
  const breakdownRes = await queryGlobal(`
    SELECT status, COUNT(*)::int as count FROM candidates GROUP BY status ORDER BY COUNT(*) DESC;
  `);

  const tokensRes = await queryGlobal(`
    SELECT COUNT(*)::int as active_tokens FROM candidates WHERE assessment_token IS NOT NULL AND assessment_token_expiry > NOW();
  `);

  const attemptsRes = await queryGlobal(`
    SELECT status, COUNT(*)::int as count FROM assessment_attempts GROUP BY status;
  `);

  console.log("\n=======================================================");
  console.log("✅ [Root Remediation Complete] Summary Report:");
  console.log(`- Assessment Tokens Restored / Re-issued: ${restoredTokensCount}`);
  console.log(`- Candidate Statuses Corrected: ${correctedStatusCount}`);
  console.log(`  └─ Restored to Interviewing: ${restoredInterviewCount}`);
  console.log(`  └─ Restored to Shortlisted: ${restoredShortlistCount}`);
  console.log(`  └─ Restored to Review: ${restoredReviewCount}`);
  console.log(`- Active 7-Day Assessment Tokens in DB: ${tokensRes.rows[0]?.active_tokens || 0}`);
  console.log("- Current Candidate Stage Distribution:");
  console.table(breakdownRes.rows);
  console.log("- Assessment Attempts Distribution:");
  console.table(attemptsRes.rows);
  console.log("=======================================================\n");

  return {
    restoredTokensCount,
    correctedStatusCount,
    stageBreakdown: breakdownRes.rows
  };
}

reprocessAllCandidatesRoot()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("❌ Remediation script failed:", err);
    process.exit(1);
  });
