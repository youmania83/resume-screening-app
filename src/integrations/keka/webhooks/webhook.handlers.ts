// src/integrations/keka/webhooks/webhook.handlers.ts

import crypto from "crypto";
import { kekaConfig } from "../config/keka.config.js";
import { kekaWebhooksService } from "../services/webhooks.service.js";
import { kekaApplicationsService } from "../services/applications.service.js";
import { kekaWorkflowService } from "../services/workflow.service.js";
import { query } from "../../../lib/db.js";

/**
 * Validates the HMAC signature sent in Keka webhook headers.
 */
export function validateWebhookSignature(payload: string, signature: string): boolean {
  if (!kekaConfig.webhookSecret) {
    // If no secret configured, fail-open in development or skip verification
    console.warn("⚠️ KEKA_WEBHOOK_SECRET is not set. Skipping signature validation.");
    return true;
  }
  
  try {
    const computedSignature = crypto
      .createHmac("sha256", kekaConfig.webhookSecret)
      .update(payload)
      .digest("hex");
      
    return crypto.timingSafeEqual(
      Buffer.from(computedSignature, "utf8"),
      Buffer.from(signature, "utf8")
    );
  } catch (err) {
    console.error("❌ Webhook signature validation error:", err);
    return false;
  }
}

/**
 * Processes a logged webhook event asynchronously based on the event type.
 */
export async function processWebhookEvent(eventId: string, eventType: string, payload: any): Promise<void> {
  console.log(`Processing Webhook Event [${eventId}] - Type: ${eventType}`);
  
  try {
    await kekaWebhooksService.incrementRetryCount(eventId);

    switch (eventType) {
      case "candidate.created":
      case "candidate.updated": {
        // Sync candidate fields
        const c = payload.candidate;
        if (!c || !c.id) throw new Error("Missing candidate data in payload");
        
        let mappedJobId: string | null = null;
        let roleTitle: string | null = null;

        if (c.jobId) {
          const jobCheck = await query(
            `SELECT id, title FROM jobs WHERE (id = $1 OR external_id = $1) AND (sync_status IS DISTINCT FROM 'removed' AND status = 'active') LIMIT 1;`,
            [c.jobId]
          );
          if (jobCheck.rowCount && jobCheck.rowCount > 0) {
            mappedJobId = jobCheck.rows[0].id;
            roleTitle = jobCheck.rows[0].title;
          }
        }

        // Only auto-map by title when it identifies exactly one active job.
        // Multiple open postings can share a title at different locations
        // (e.g. "Project Engineer"); guessing between them with LIMIT 1
        // silently collapsed every applicant onto whichever posting synced
        // first, regardless of the specific Job ID they actually applied to.
        if (!mappedJobId && c.jobTitle) {
          const titleCheck = await query(
            `SELECT id, title FROM jobs WHERE LOWER(title) = LOWER($1) AND (sync_status IS DISTINCT FROM 'removed' AND status = 'active');`,
            [c.jobTitle]
          );
          if (titleCheck.rowCount === 1) {
            mappedJobId = titleCheck.rows[0].id;
            roleTitle = titleCheck.rows[0].title;
          } else if (titleCheck.rowCount && titleCheck.rowCount > 1) {
            console.warn(`[Keka Webhook] Candidate "${c.name}" (${c.email}): Job ID "${c.jobId}" did not match a known posting and title "${c.jobTitle}" matches ${titleCheck.rowCount} active postings. Refusing to guess.`);
          }
        }

        // REQUIREMENT: Only candidates with a mapped active job role should be processed.
        if (!mappedJobId || !roleTitle) {
          console.log(`[Keka Webhook] Skipping webhook candidate "${c.name}" (${c.email}): Job "${c.jobId || c.jobTitle || 'Unspecified'}" is not an active open position.`);
          break;
        }

        // Cross-source dedup: merge onto an existing candidate with the same
        // email (e.g. already ingested via the email/upload pipeline) instead
        // of inserting a second row keyed by Keka's own candidate id.
        let targetId = c.id;
        if (c.email) {
          const dupCheck = await query(
            `SELECT id FROM candidates WHERE LOWER(email) = LOWER($1) AND id != $2 LIMIT 1;`,
            [c.email, c.id]
          );
          if (dupCheck.rowCount && dupCheck.rowCount > 0) {
            targetId = dupCheck.rows[0].id;
          }
        }

        await query(`
          INSERT INTO candidates (
            id, name, email, phone, role, score, match_percent, experience_years,
            status, application_source, keka_status, applied_date, job_id, external_id, source_system, sync_status, last_synced_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            phone = EXCLUDED.phone,
            role = EXCLUDED.role,
            keka_status = EXCLUDED.keka_status,
            job_id = COALESCE(candidates.job_id, EXCLUDED.job_id),
            last_synced_at = NOW()
        `, [
          targetId,
          c.name,
          c.email,
          c.phone || null,
          roleTitle,
          c.aiScore || 0,
          c.aiScore || 0,
          c.experienceYears || 0,
          c.status || "active",
          c.source || "Keka Webhook",
          c.currentStage || "Applied",
          c.appliedDate || new Date().toISOString(),
          mappedJobId,
          c.id,
          "Keka",
          "synced"
        ]);

        // Trigger automated screening only if this candidate has never been
        // AI-screened locally. `c.aiScore` from the Keka payload is NOT a
        // reliable signal here — Keka never populates an AI score (that is
        // computed exclusively by this portal's own DeepSeek pipeline), so
        // it reads as undefined/null on every single "candidate.created"
        // webhook, including ones Keka resends for an existing candidate
        // (e.g. a re-application). Gating on that field alone re-triggered
        // a full re-screening of already-shortlisted/invited candidates —
        // silently overwriting their real score and status with a fresh,
        // often-lower result (and, if `job_id` had also drifted, scored
        // against the wrong job description entirely). The local `score`
        // column is the only trustworthy "already screened" signal.
        const existingScoreRes = await query("SELECT score FROM candidates WHERE id = $1;", [targetId]);
        const currentScore = existingScoreRes.rows[0]?.score;
        if (eventType === "candidate.created" && (currentScore === null || currentScore === undefined || currentScore === 0)) {
          // Trigger async automated resume screening
          kekaWorkflowService.screenCandidate(targetId).catch(err => {
            console.error(`❌ Automated screening failed for candidate ${targetId}:`, err);
          });
        }

        // Onboarding Trigger Check
        if (c.currentStage && (c.currentStage.toLowerCase() === "hired" || c.currentStage.toLowerCase() === "offer accepted" || c.currentStage.toLowerCase() === "offer_accepted")) {
          console.log(`Candidate ${targetId} updated to finalized stage (${c.currentStage}). Triggering onboarding...`);
          kekaWorkflowService.onboardCandidate(targetId).catch(err => {
            console.error(`❌ Automated onboarding failed for candidate ${targetId}:`, err);
          });
        }
        break;
      }

      case "application.created":
      case "application.updated": {
        const app = payload.application;
        if (!app || !app.id) throw new Error("Missing application data in payload");

        await query(`
          INSERT INTO applications (id, candidate_id, job_id, application_date, status, stage, source, external_id, source_system, sync_status, last_synced_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT (id) DO UPDATE SET
            stage = EXCLUDED.stage,
            status = EXCLUDED.status,
            last_synced_at = NOW()
        `, [
          app.id,
          app.candidateId,
          app.jobId,
          app.applicationDate || new Date(),
          app.status || "active",
          app.stage || "Applied",
          app.source || "Keka Webhook",
          app.id,
          "Keka",
          "synced"
        ]);
        break;
      }

      case "candidate.stage.changed": {
        const { candidateId, stage } = payload;
        if (!candidateId || !stage) throw new Error("Missing candidateId or stage in payload");
        
        await kekaApplicationsService.moveCandidateStage(candidateId, stage);

        // Onboarding Trigger Check
        if (stage.toLowerCase() === "hired" || stage.toLowerCase() === "offer accepted" || stage.toLowerCase() === "offer_accepted") {
          console.log(`Candidate ${candidateId} stage changed to finalized (${stage}). Triggering onboarding...`);
          kekaWorkflowService.onboardCandidate(candidateId).catch(err => {
            console.error(`❌ Automated onboarding failed for candidate ${candidateId}:`, err);
          });
        }
        break;
      }

      case "interview.scheduled":
      case "interview.completed": {
        const int = payload.interview;
        if (!int || !int.id) throw new Error("Missing interview data in payload");

        await query(`
          INSERT INTO interviews (id, candidate_id, job_id, scheduled_date, status, feedback, external_id, source_system, sync_status, last_synced_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            feedback = EXCLUDED.feedback,
            scheduled_date = EXCLUDED.scheduled_date,
            last_synced_at = NOW()
        `, [
          int.id,
          int.candidateId,
          int.jobId || null,
          int.dateTime,
          int.status,
          int.feedback || null,
          int.id,
          "Keka",
          "synced"
        ]);
        break;
      }

      case "offer.created":
      case "offer.accepted":
      case "offer.rejected": {
        const off = payload.offer;
        if (!off || !off.id) throw new Error("Missing offer data in payload");

        await query(`
          INSERT INTO offers (id, candidate_id, job_id, salary, joining_date, status, offer_letter_url, external_id, source_system, sync_status, last_synced_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            salary = EXCLUDED.salary,
            joining_date = EXCLUDED.joining_date,
            last_synced_at = NOW()
        `, [
          off.id,
          off.candidateId,
          off.jobId,
          off.salary,
          off.joiningDate,
          off.status,
          off.offerLetterUrl || null,
          off.id,
          "Keka",
          "synced"
        ]);
        break;
      }

      default:
        console.warn(`⚠️ Unhandled Keka webhook event type: ${eventType}`);
    }

    await kekaWebhooksService.markEventProcessed(eventId);
    console.log(`✅ Webhook Event [${eventId}] processed successfully.`);
  } catch (err: any) {
    console.error(`❌ Webhook Event [${eventId}] processing failed:`, err);
    await kekaWebhooksService.markEventFailed(eventId, err);
  }
}
