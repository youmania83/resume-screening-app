// src/scripts/remediateFalseShortlists.ts
import { queryGlobal } from "../lib/tenantDb.js";
import { evaluateCandidateDetailedScore, isCandidateEligibleForShortlisting } from "../lib/scoreCalculator.js";
import { activeJobSql } from "../lib/appConfig.js";

interface RemediationSummary {
  candidateId: string;
  name: string;
  email: string;
  jobTitle: string;
  oldScore: number;
  newScore: number;
  oldStatus: string;
  newStatus: string;
  tokenRevoked: boolean;
  reasons: string[];
}

export async function remediateFalseShortlists(): Promise<RemediationSummary[]> {
  console.log("===============================================================");
  console.log("🔍 [Remediation] Auditing candidate scores and shortlists...");
  console.log("===============================================================");

  // Find all candidates from Sept 2026 onwards or candidates currently shortlisted/with tokens
  const candRes = await queryGlobal(
    `SELECT c.id, c.name, c.email, c.role, c.score, c.skills, c.experience_years, 
            c.education, rt.raw_text, c.status, c.assessment_token, c.assessment_status,
            c.job_id, j.title AS job_title, j.description AS job_desc, j.experience_required,
            c.tenant_id
       FROM candidates c
       LEFT JOIN jobs j ON c.job_id = j.id
       LEFT JOIN resume_texts rt ON rt.batch_id = c.id
      WHERE (
        c.created_at >= '2026-09-01'::timestamptz 
        OR LOWER(COALESCE(c.status, '')) IN ('shortlisted', 'qualified', 'assessment')
        OR c.assessment_token IS NOT NULL
        OR c.score >= 80
      )
      ORDER BY c.created_at DESC;`
  );

  console.log(`📋 Found ${candRes.rows.length} candidates to evaluate against strict criteria.`);

  const summary: RemediationSummary[] = [];

  for (const cand of candRes.rows) {
    const jobTitle = cand.job_title || cand.role || "Unspecified Role";
    const oldScore = Number(cand.score) || 0;
    const oldStatus = cand.status || "Applied";
    let tokenRevoked = false;

    // Run deep precision evaluation
    const evalResult = evaluateCandidateDetailedScore({
      candidateExperienceYears: Number(cand.experience_years) || 0,
      requiredExperienceText: cand.experience_required || undefined,
      candidateSkills: Array.isArray(cand.skills) ? cand.skills : [],
      candidateRole: cand.role || "",
      jobTitle: cand.job_title || cand.role || "",
      candidateEducation: cand.education || undefined,
      rawResumeText: cand.raw_text || undefined,
      jobDescriptionText: cand.job_desc || undefined
    });

    const newScore = evalResult.score;
    const isEligible = evalResult.isEligible;
    const reasons = evalResult.ineligibilityReasons;

    let newStatus = oldStatus;
    let shouldRevokeToken = false;

    if (!cand.job_id) {
      // Unmapped candidate cannot be shortlisted
      if (["shortlisted", "qualified", "assessment"].includes(oldStatus.toLowerCase())) {
        newStatus = "Review";
        shouldRevokeToken = true;
        reasons.unshift("Candidate has no valid target job mapped.");
      }
    } else if (!isEligible) {
      // Ineligible candidate (sparse info, role mismatch, or experience deficit)
      if (["shortlisted", "qualified", "assessment"].includes(oldStatus.toLowerCase())) {
        newStatus = newScore < 50 ? "Review" : "Review";
        shouldRevokeToken = true;
      }
      if (cand.assessment_token) {
        shouldRevokeToken = true;
      }
    } else if (newScore >= 80 && isEligible) {
      // Truly qualified candidate
      if (["applied", "review", "not specified"].includes(oldStatus.toLowerCase())) {
        newStatus = "shortlisted";
      }
    }

    if (shouldRevokeToken && cand.assessment_token) {
      tokenRevoked = true;
    }

    // Update candidate in database if score, status, or token changed
    if (newScore !== oldScore || newStatus !== oldStatus || tokenRevoked) {
      await queryGlobal(
        `UPDATE candidates
            SET score = $1,
                ai_match_score = $1,
                status = $2,
                assessment_token = CASE WHEN $3 THEN NULL ELSE assessment_token END,
                assessment_token_expiry = CASE WHEN $3 THEN NULL ELSE assessment_token_expiry END,
                assessment_status = CASE WHEN $3 THEN NULL ELSE assessment_status END
          WHERE id = $4;`,
        [newScore, newStatus, tokenRevoked, cand.id]
      );

      // Log activity
      await queryGlobal(
        `INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id)
         VALUES ($1, 'remediation_audit', $2, $3);`,
        [
          cand.id,
          `Remediation Audit: Score updated from ${oldScore} to ${newScore}. Status: ${oldStatus} -> ${newStatus}. ` +
          (tokenRevoked ? `Assessment token revoked. ` : "") +
          (reasons.length > 0 ? `Issues: ${reasons.join("; ")}` : "Meets eligibility criteria."),
          cand.tenant_id
        ]
      ).catch(() => {});

      summary.push({
        candidateId: cand.id,
        name: cand.name,
        email: cand.email,
        jobTitle,
        oldScore,
        newScore,
        oldStatus,
        newStatus,
        tokenRevoked,
        reasons
      });
    }
  }

  console.log(`\n✅ Audit complete. Remediated ${summary.length} candidates.`);
  for (const item of summary) {
    console.log(
      ` - [${item.candidateId}] ${item.name} | Role: "${item.jobTitle}" | Score: ${item.oldScore} -> ${item.newScore} | Status: ${item.oldStatus} -> ${item.newStatus} | Token Revoked: ${item.tokenRevoked}`
    );
    if (item.reasons.length > 0) {
      console.log(`   Reasons: ${item.reasons.join(" | ")}`);
    }
  }

  return summary;
}

// Allow standalone execution
if (import.meta.url === `file://${process.argv[1]}`) {
  remediateFalseShortlists()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Remediation script failed:", err);
      process.exit(1);
    });
}
