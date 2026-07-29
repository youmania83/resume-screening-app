// src/services/AutonomousRecruitmentService.ts
import { queryGlobal } from "../lib/tenantDb.js";
import { parseAndEvalResume } from "../worker/resumeWorker.js";
import { ensureJobAssessment } from "../lib/assessmentService.js";
import { sendAssessmentInviteEmail, sendInterviewScheduleEmail, sendAssessmentResultDetailsEmail, canSendEmailToCandidate, recordEmailLog } from "../lib/email.js";
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

    try {
      // 1. Sync Ingestion (Zoho Mail & Email Inbox)
      try {
        const zohoEnabled = process.env.ZOHO_MAIL_ENABLED === "true";
        if (zohoEnabled) {
          const { EmailSyncService } = await import("../integrations/email/EmailSyncService.js");
          const tenantsRes = await queryGlobal("SELECT id FROM tenants;");
          for (const t of tenantsRes.rows) {
            try {
              const count = await EmailSyncService.syncMailbox(t.id, "zoho");
              ingested += count;
            } catch (err: any) {
              console.warn(`[Autonomous Cycle] Mail sync warning for tenant ${t.id}:`, err.message);
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
           ORDER BY created_at ASC 
           LIMIT 25;`
        );

        for (const item of queuedResumes.rows) {
          try {
            await parseAndEvalResume(item.tenant_id, item.id, item.file_url, "application/pdf");
            screened++;
          } catch (evalErr: any) {
            console.error(`[Autonomous Cycle] Resume processing error for inbox item ${item.id}:`, evalErr.message);
          }
        }
      } catch (screenErr: any) {
        console.error("🚨 [Autonomous Cycle] Screening queue error:", screenErr.message);
      }

      // 3. Automated Assessment Dispatches for Shortlisted Candidates
      try {
        const shortlistedRes = await queryGlobal(
          `SELECT c.id, c.name, c.email, c.job_id, c.tenant_id, c.role, j.title as job_title, j.description as job_desc
           FROM candidates c
           LEFT JOIN jobs j ON c.job_id = j.id
           WHERE LOWER(c.status) IN ('shortlisted', 'qualified')
             AND (c.assessment_token IS NULL OR c.assessment_status IS NULL OR c.assessment_status = 'pending')
             AND c.assessment_status IS DISTINCT FROM 'passed'
             AND c.assessment_status IS DISTINCT FROM 'completed'
             AND c.email IS NOT NULL AND c.email LIKE '%@%'
           ORDER BY c.created_at ASC
           LIMIT 20;`
        );

        for (const candidate of shortlistedRes.rows) {
          try {
            const jobId = candidate.job_id || "default-job";
            const jobTitle = candidate.job_title || candidate.role || "Software Engineer";
            const jobDesc = candidate.job_desc || jobTitle;

            // Ensure 15 MCQ AI Assessment exists & stored in DB
            await ensureJobAssessment(jobId, jobTitle, jobDesc);

            // Generate token if missing
            let token = candidate.assessment_token;
            let expiry = candidate.assessment_token_expiry;
            if (!token) {
              token = crypto.randomBytes(24).toString("hex");
              expiry = new Date();
              expiry.setDate(expiry.getDate() + 7);

              await queryGlobal(
                `UPDATE candidates 
                 SET assessment_token = $1, assessment_token_expiry = $2, assessment_status = 'pending' 
                 WHERE id = $3;`,
                [token, expiry, candidate.id]
              );
            }

            // Anti-spam check (Max 5 emails cap & 24h template deduplication)
            const checkEmail = await canSendEmailToCandidate(candidate.email, "assessment_invitation", candidate.id);
            if (checkEmail.canSend) {
              await sendAssessmentInviteEmail({
                candidateName: candidate.name,
                candidateEmail: candidate.email,
                jobTitle,
                token,
                expiryDate: expiry || new Date(Date.now() + 7 * 86400000),
                tenantId: candidate.tenant_id
              });

              await queryGlobal(
                `INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id)
                 VALUES ($1, 'assessment_invited', $2, $3);`,
                [candidate.id, `Autonomous 30-min cycle: AI Assessment invitation sent to ${candidate.email}`, candidate.tenant_id]
              );
              invited++;
            } else {
              console.log(`ℹ️ [Autonomous Cycle] Skipped assessment invite to ${candidate.email}: ${checkEmail.reason}`);
            }
          } catch (invErr: any) {
            console.error(`[Autonomous Cycle] Failed assessment dispatch for candidate ${candidate.id}:`, invErr.message);
          }
        }
      } catch (inviteErr: any) {
        console.error("🚨 [Autonomous Cycle] Assessment invite dispatch error:", inviteErr.message);
      }

      // 4. Auto-Promote Candidates Clearing Assessment -> Schedule Interview & Stage Emails
      try {
        const passedCandidatesRes = await queryGlobal(
          `SELECT c.id, c.name, c.email, c.job_id, c.tenant_id, c.role, c.score, c.assessment_score, c.final_score, j.title as job_title
           FROM candidates c
           LEFT JOIN jobs j ON c.job_id = j.id
           WHERE c.assessment_status = 'passed'
             AND LOWER(c.status) NOT IN ('interviewing', 'interview_scheduled', 'selected', 'hired')
           LIMIT 20;`
        );

        for (const candidate of passedCandidatesRes.rows) {
          try {
            const interviewDate = new Date();
            interviewDate.setDate(interviewDate.getDate() + 2);
            interviewDate.setHours(10, 0, 0, 0);

            const interviewId = `interview-auto-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
            
            await queryGlobal(
              `INSERT INTO interviews (id, candidate_id, job_id, scheduled_date, status, tenant_id)
               VALUES ($1, $2, $3, $4, 'scheduled', $5)
               ON CONFLICT (id) DO NOTHING;`,
              [interviewId, candidate.id, candidate.job_id, interviewDate, candidate.tenant_id]
            );

            await queryGlobal(
              `UPDATE candidates 
               SET status = 'interviewing', interview_scheduled_date = $1 
               WHERE id = $2;`,
              [interviewDate, candidate.id]
            );

            await queryGlobal(
              `INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id)
               VALUES ($1, 'interview_scheduled', $2, $3);`,
              [candidate.id, `Autonomous 30-min cycle: Candidate cleared assessment (Final score ${candidate.final_score || 80}%). HR Interview scheduled.`, candidate.tenant_id]
            );

            // Send Interview Schedule Email (subject to anti-spam cap)
            const checkEmail = await canSendEmailToCandidate(candidate.email, "interview_schedule", candidate.id);
            if (checkEmail.canSend) {
              await sendInterviewScheduleEmail({
                candidateName: candidate.name,
                candidateEmail: candidate.email,
                jobTitle: candidate.job_title || candidate.role,
                resumeScore: candidate.score || 80,
                assessmentScore: candidate.assessment_score || 85,
                finalScore: candidate.final_score || 83,
                scheduledDate: interviewDate,
                tenantId: candidate.tenant_id
              });
            }

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
