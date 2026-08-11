// src/services/AutonomousRecruitmentService.ts
import { queryGlobal } from "../lib/tenantDb.js";
import { parseAndEvalResume } from "../worker/resumeWorker.js";
import { ensureJobAssessment } from "../lib/assessmentService.js";
import { sendAssessmentInviteEmail, sendInterviewScheduleEmail } from "../lib/email.js";
import {
  ACTIVE_JOB_SQL,
  activeJobSql,
  getIngestionCutoffIso,
  nextBusinessDaySlot,
  PIPELINE_THRESHOLDS,
  isStrictJobMapping,
} from "../lib/appConfig.js";
import { syncPipelineStages } from "../scripts/syncPipelineStages.js";
import crypto from "crypto";

export class AutonomousRecruitmentService {
  /**
   * Executes the complete autonomous recruitment cycle (Runs every 30 minutes via cron).
   */
  static async run30MinCycle(): Promise<{ ingested: number; screened: number; invited: number; promoted: number }> {
    console.log("\n=======================================================");
    console.log("🤖 [Autonomous Cycle] Starting 30-Minute Recruitment Sync...");
    console.log("=======================================================");

    let ingested = 0;
    let screened = 0;
    let invited = 0;
    let promoted = 0;

    // Every bulk operation below is scoped to records created at/after the
    // ingestion cutoff. Without this scoping the cycle rewrote the entire
    // historical candidate table every 30 minutes (re-scoring, re-mapping roles
    // and re-triggering stage emails for long-closed applications).
    const cutoffIso = getIngestionCutoffIso();
    console.log(`🗓️  [Autonomous Cycle] Processing records received on/after ${cutoffIso}`);

    try {
      // 1. Sync Ingestion (Zoho Mail & Email Inbox)
      try {
        const zohoEnabled = process.env.ZOHO_MAIL_ENABLED !== "false" && !!process.env.ZOHO_SMTP_USER;
        if (zohoEnabled) {
          const { EmailSyncService } = await import("../integrations/email/EmailSyncService.js");
          const tenantsRes = await queryGlobal("SELECT id FROM tenants;");
          const tenantIds = tenantsRes.rows.map(t => t.id);
          if (tenantIds.length === 0) {
            tenantIds.push("default-tenant", "87b949cb-2c0d-44ca-a6f5-a025ec43e6a5");
          }
          for (const tId of tenantIds) {
            try {
              const count = await EmailSyncService.syncMailbox(tId, "zoho");
              ingested += count;
            } catch (err: any) {
              console.warn(`[Autonomous Cycle] Mail sync warning for tenant ${tId}:`, err.message);
            }
          }
        }
      } catch (ingestErr: any) {
        console.error("🚨 [Autonomous Cycle] Mail ingestion error:", ingestErr.message);
      }

      // 2. Process Queued Inbox Resumes
      try {
        const queuedResumes = await queryGlobal(
          `SELECT id, tenant_id, file_url, file_name
           FROM resume_inbox
           WHERE status IN ('Queued', 'Uploaded', 'Pending')
             AND created_at >= $1::timestamptz
           ORDER BY created_at ASC
           LIMIT 25;`,
          [cutoffIso]
        );

        for (const item of queuedResumes.rows) {
          try {
            // Mark as Processing to prevent double-picks by concurrent cycles
            const lockRes = await queryGlobal(
              `UPDATE resume_inbox SET status = 'Processing' WHERE id = $1 AND status IN ('Queued', 'Uploaded', 'Pending') RETURNING id;`,
              [item.id]
            );
            if (!lockRes.rowCount || lockRes.rowCount === 0) {
              console.log(`⏭️ [Autonomous Cycle] Inbox item ${item.id} already being processed. Skipping.`);
              continue;
            }
            await parseAndEvalResume(item.tenant_id, item.id, item.file_url, "application/pdf");
            screened++;
          } catch (evalErr: any) {
            console.error(`[Autonomous Cycle] Resume processing error for inbox item ${item.id}:`, evalErr.message);
            // Reset status so it can be retried
            await queryGlobal(`UPDATE resume_inbox SET status = 'Queued' WHERE id = $1;`, [item.id]).catch(() => {});
          }
        }
      } catch (screenErr: any) {
        console.error("🚨 [Autonomous Cycle] Screening queue error:", screenErr.message);
      }

      // 2.5 Auto-promote high-scoring candidates to 'shortlisted'.
      // Requires an *open* job opening: a candidate attached to no job, or to a
      // closed/removed requisition, must not be shortlisted or invited.
      try {
        const promoteRes = await queryGlobal(
          `UPDATE candidates c
              SET status = 'shortlisted'
            WHERE c.score >= $1
              AND c.created_at >= $2::timestamptz
              AND (c.status IS NULL OR LOWER(c.status) IN ('applied', 'not specified'))
              AND EXISTS (
                    SELECT 1 FROM jobs j
                     WHERE j.id = c.job_id
                       AND ${activeJobSql("j")}
                  );`,
          [PIPELINE_THRESHOLDS.SHORTLIST, cutoffIso]
        );
        if (promoteRes.rowCount && promoteRes.rowCount > 0) {
          console.log(`✨ [Autonomous Cycle] Auto-promoted ${promoteRes.rowCount} high-scoring (≥${PIPELINE_THRESHOLDS.SHORTLIST}%) candidates on open roles to 'shortlisted'.`);
        }

        // Run full multi-stage sync (Shortlisted >=80%, Under Review 60-79%, Rejected <60%, Interviewing)
        await syncPipelineStages();
      } catch (promoteErr: any) {
        console.error("🚨 [Autonomous Cycle] Candidate promotion error:", promoteErr.message);
      }

      // 2.6 Autonomous Candidate-Job Role Remapping & Matching
      //
      // Under strict job mapping (the default) this pass is DISABLED entirely.
      // An applicant belongs to the opening they applied for; a periodic
      // best-match sweep that reassigns job_id is precisely what moved the same
      // candidate between roles over successive cycles and made already-selected
      // people resurface under other openings. Unmapped applicants wait for HR.
      try {
        if (isStrictJobMapping()) {
          const unmappedRes = await queryGlobal(
            `SELECT COUNT(*)::int AS count
               FROM candidates
              WHERE created_at >= $1::timestamptz
                AND job_id IS NULL
                AND LOWER(COALESCE(status, '')) NOT IN ('rejected', 'hired', 'selected', 'withdrawn');`,
            [cutoffIso]
          );
          const unmapped = unmappedRes.rows[0]?.count || 0;
          if (unmapped > 0) {
            console.log(`ℹ️ [Autonomous Cycle] ${unmapped} applicant(s) await manual job mapping by HR (strict job mapping is enabled). No automatic reassignment performed.`);
          }
        } else {
        const { inferCandidateRole, isGenericRoleTitle } = await import("../lib/roleInference.js");

        // Only *open* openings are matching targets.
        const jobsRes = await queryGlobal(
          `SELECT id, tenant_id, title, description, location, experience_required
             FROM jobs
            WHERE ${ACTIVE_JOB_SQL};`
        );
        const activeJobs = jobsRes.rows;

        // Only candidates from the cutoff forward, and only those that still need
        // mapping. Re-scanning every candidate on every cycle was both a
        // performance problem and a correctness problem (it kept overwriting
        // roles and scores that HR had already curated).
        const candRes = await queryGlobal(
          `SELECT id, tenant_id, name, role, skills, experience_years, job_id, score, match_percent, recommendation, education
             FROM candidates
            WHERE created_at >= $1::timestamptz
              AND LOWER(COALESCE(status, '')) NOT IN ('rejected', 'hired', 'selected', 'duplicate', 'withdrawn')
              AND (
                    job_id IS NULL
                    OR NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = candidates.job_id AND ${activeJobSql("j")})
                  )
            LIMIT 500;`,
          [cutoffIso]
        );

        let autoRemappedCount = 0;

        for (const c of candRes.rows) {
          let bestJob: any = null;
          let highestScore = 0;
          let matchedSkills: string[] = [];
          let missingSkills: string[] = [];

          const candSkills: string[] = Array.isArray(c.skills) ? c.skills : [];
          const expYears = Number(c.experience_years) || 0;

          // Tenant isolation: a candidate may only ever be matched against
          // openings belonging to their own tenant.
          const tenantJobs = activeJobs.filter(j => j.tenant_id === c.tenant_id);

          if (tenantJobs.length > 0) {
            for (const job of tenantJobs) {
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

              if (job.experience_required) {
                const reqExp = parseInt(job.experience_required.replace(/[^0-9]/g, ""), 10);
                if (!isNaN(reqExp) && expYears >= reqExp) {
                  score += 15;
                }
              }

              score = Math.min(100, score);

              if (score > highestScore) {
                highestScore = score;
                bestJob = job;
                matchedSkills = jMatched;
                missingSkills = jMissing;
              }
            }
          }

          if (bestJob && highestScore >= PIPELINE_THRESHOLDS.JOB_MATCH_FLOOR && (c.job_id !== bestJob.id || isGenericRoleTitle(c.role))) {
            // NOTE: `score` holds the AI resume-evaluation score and is deliberately
            // left untouched here. The previous `score = GREATEST(score, heuristic)`
            // let this crude keyword heuristic overwrite the AI score and ratchet
            // candidates over the 80% shortlist threshold without any AI evaluation.
            await queryGlobal(
              `UPDATE candidates
               SET job_id = $1,
                   role = $2,
                   match_percent = $3,
                   matched_skills = $4,
                   missing_skills = $5,
                   last_synced_at = NOW()
               WHERE id = $6;`,
              [bestJob.id, bestJob.title, highestScore, matchedSkills, missingSkills, c.id]
            );
            autoRemappedCount++;
          } else if (isGenericRoleTitle(c.role) || !c.role) {
            const suitableRole = inferCandidateRole(c);
            await queryGlobal(
              `UPDATE candidates 
               SET role = $1, 
                   job_id = NULL,
                   last_synced_at = NOW()
               WHERE id = $2;`,
              [suitableRole, c.id]
            );
            autoRemappedCount++;
          }
        }

        if (autoRemappedCount > 0) {
          console.log(`✨ [Autonomous Cycle] Autonomously remapped/matched ${autoRemappedCount} candidates to active jobs and inferred professional roles.`);
        }
        } // end: non-strict job mapping
      } catch (remapErr: any) {
        console.error("🚨 [Autonomous Cycle] Candidate role remapping error:", remapErr.message);
      }

      // 3. Automated Assessment Dispatches for Shortlisted Candidates.
      //
      // Preconditions enforced here (each one was a live defect):
      //  - the candidate must be attached to an OPEN job opening (previously a
      //    NULL job_id fell back to the literal string "default-job", which does
      //    not exist and made ensureJobAssessment fail on a foreign key);
      //  - the invitation must not already have been sent (assessment_invited_at),
      //    which stopped the cycle from re-mailing the same candidate every
      //    30 minutes for as long as they stayed in 'pending';
      //  - the assessment must not already be completed/passed.
      try {
        const shortlistedRes = await queryGlobal(
          `SELECT c.id, c.name, c.email, c.job_id, c.tenant_id, c.role, c.assessment_token, c.assessment_token_expiry, j.title as job_title, j.description as job_desc
           FROM candidates c
           LEFT JOIN jobs j ON c.job_id = j.id
           WHERE c.score >= 80
             AND LOWER(c.status) IN ('shortlisted', 'qualified')
             AND c.assessment_invited_at IS NULL
             AND c.email IS NOT NULL AND c.email LIKE '%@%'
           ORDER BY c.created_at DESC
           LIMIT 10;`
        );

        for (const candidate of shortlistedRes.rows) {
          try {
            const jobTitle = candidate.job_title || candidate.role || "Open Position";
            const jobDesc = candidate.job_desc || jobTitle;

            // Ensure 15 MCQ AI Assessment exists & stored in DB
            await ensureJobAssessment(candidate.job_id, jobTitle, jobDesc);

            // Generate token if missing
            let token = candidate.assessment_token;
            let expiry: Date | null = candidate.assessment_token_expiry
              ? new Date(candidate.assessment_token_expiry)
              : null;

            if (!token || !expiry || expiry.getTime() <= Date.now()) {
              token = crypto.randomBytes(24).toString("hex");
              expiry = new Date();
              expiry.setDate(expiry.getDate() + 7);

              await queryGlobal(
                `UPDATE candidates
                 SET status = 'shortlisted', assessment_token = $1, assessment_token_expiry = $2, assessment_status = 'pending'
                 WHERE id = $3;`,
                [token, expiry, candidate.id]
              );
            }

            // sendAssessmentInviteEmail self-guards against duplicates and records
            // the delivery in email_logs.
            const inviteResult = await sendAssessmentInviteEmail({
              candidateName: candidate.name,
              candidateEmail: candidate.email,
              jobTitle,
              token,
              expiryDate: expiry,
              tenantId: candidate.tenant_id,
              candidateId: candidate.id
            });

            invited++;
            // 3-second delay between dispatches to adhere to Zoho SMTP rate limits
            await new Promise(resolve => setTimeout(resolve, 3000));

            if (inviteResult?.success) {
              // Mark as invited so no later cycle can pick this candidate up again.
              await queryGlobal(
                `UPDATE candidates SET assessment_invited_at = NOW() WHERE id = $1;`,
                [candidate.id]
              );

              await queryGlobal(
                `INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id)
                 VALUES ($1, 'assessment_invited', $2, $3);`,
                [candidate.id, `Autonomous cycle: AI Assessment invitation sent to ${candidate.email} for "${jobTitle}".`, candidate.tenant_id]
              );
              invited++;
            } else if (inviteResult?.skipped) {
              // Already delivered previously (e.g. by the resume worker) — backfill
              // the marker so this candidate stops being re-queried every cycle.
              await queryGlobal(
                `UPDATE candidates SET assessment_invited_at = COALESCE(assessment_invited_at, NOW()) WHERE id = $1;`,
                [candidate.id]
              );
              console.log(`ℹ️ [Autonomous Cycle] Assessment invite already delivered to ${candidate.email}: ${inviteResult.reason}`);
            } else {
              console.warn(`⚠️ [Autonomous Cycle] Assessment invite to ${candidate.email} was not delivered. Will retry next cycle.`);
            }
          } catch (invErr: any) {
            console.error(`[Autonomous Cycle] Failed assessment dispatch for candidate ${candidate.id}:`, invErr.message);
          }
        }
      } catch (inviteErr: any) {
        console.error("🚨 [Autonomous Cycle] Assessment invite dispatch error:", inviteErr.message);
      }

      // 4. Auto-Promote Candidates Clearing Assessment -> Schedule Interview & Stage Emails
      //
      // Only candidates whose FINAL score clears the interview threshold advance
      // automatically. Previously this block keyed off `assessment_status = 'passed'`
      // alone — but submit() also marks 60-79% candidates as 'passed' while placing
      // them in HR Review, so the cycle silently auto-advanced them to interview
      // and bypassed the human review step entirely.
      try {
        const passedCandidatesRes = await queryGlobal(
          `SELECT c.id, c.name, c.email, c.job_id, c.tenant_id, c.role,
                  c.score, c.assessment_score, c.final_score, j.title as job_title
           FROM candidates c
           JOIN jobs j ON c.job_id = j.id AND ${activeJobSql("j")}
           WHERE c.assessment_status = 'passed'
             AND c.final_score IS NOT NULL
             AND c.final_score >= $1
             AND c.created_at >= $2::timestamptz
             AND LOWER(COALESCE(c.status, '')) NOT IN ('interviewing', 'interview_scheduled', 'selected', 'hired', 'rejected')
             AND NOT EXISTS (
                   SELECT 1 FROM interviews i
                    WHERE i.candidate_id = c.id
                      AND i.status IN ('scheduled', 'completed')
                 )
           ORDER BY c.assessment_completed_at ASC NULLS LAST
           LIMIT 20;`,
          [PIPELINE_THRESHOLDS.INTERVIEW, cutoffIso]
        );

        for (const candidate of passedCandidatesRes.rows) {
          try {
            // Business-day slot: the old "+2 calendar days" routinely landed
            // interviews on a Saturday or Sunday.
            const interviewDate = nextBusinessDaySlot(2, 10);
            const interviewId = crypto.randomUUID();

            // Guarded insert: a partial unique index on (candidate_id) for
            // scheduled interviews makes a concurrent double-book impossible;
            // ON CONFLICT DO NOTHING turns the race into a no-op.
            const insertRes = await queryGlobal(
              `INSERT INTO interviews (id, candidate_id, job_id, scheduled_date, status, tenant_id)
               SELECT $1, $2, $3, $4, 'scheduled', $5
                WHERE NOT EXISTS (
                      SELECT 1 FROM interviews
                       WHERE candidate_id = $2 AND status IN ('scheduled', 'completed')
                    )
               ON CONFLICT DO NOTHING
               RETURNING id;`,
              [interviewId, candidate.id, candidate.job_id, interviewDate, candidate.tenant_id]
            );

            if (!insertRes.rowCount) {
              console.log(`⏭️ [Autonomous Cycle] Candidate ${candidate.id} already has an interview scheduled. Skipping.`);
              continue;
            }

            await queryGlobal(
              `UPDATE candidates
               SET status = 'interviewing', interview_scheduled_date = $1
               WHERE id = $2;`,
              [interviewDate, candidate.id]
            );

            await queryGlobal(
              `INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id)
               VALUES ($1, 'interview_scheduled', $2, $3);`,
              [
                candidate.id,
                `Autonomous cycle: candidate cleared the assessment (final score ${Number(candidate.final_score).toFixed(1)}%). HR interview scheduled for ${interviewDate.toISOString()}.`,
                candidate.tenant_id
              ]
            );

            // Send the interview email using the candidate's REAL scores.
            // The previous `|| 80 / || 85 / || 83` fallbacks mailed candidates
            // invented scores whenever a value was missing.
            await sendInterviewScheduleEmail({
              candidateName: candidate.name,
              candidateEmail: candidate.email,
              jobTitle: candidate.job_title || candidate.role || "Open Position",
              resumeScore: Number(candidate.score) || 0,
              assessmentScore: Number(candidate.assessment_score) || 0,
              finalScore: Number(candidate.final_score),
              scheduledDate: interviewDate,
              tenantId: candidate.tenant_id,
              candidateId: candidate.id,
              interviewId
            });

            promoted++;
          } catch (promErr: any) {
            console.error(`[Autonomous Cycle] Auto-promotion failed for candidate ${candidate.id}:`, promErr.message);
          }
        }
      } catch (autoPromErr: any) {
        console.error("🚨 [Autonomous Cycle] Auto-promotion error:", autoPromErr.message);
      }

      console.log(`✅ [Autonomous Cycle] 30-min sync complete. Screened: ${screened}, Assessment Invites: ${invited}, Interview Promoted: ${promoted}`);
    } catch (err: any) {
      console.error("🚨 [Autonomous Cycle] Fatal cycle error:", err.message);
    }

    return { ingested, screened, invited, promoted };
  }
}
