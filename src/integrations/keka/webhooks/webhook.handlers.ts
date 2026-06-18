// src/integrations/keka/webhooks/webhook.handlers.ts

import crypto from "crypto";
import { kekaConfig } from "../config/keka.config";
import { kekaWebhooksService } from "../services/webhooks.service";
import { kekaCandidatesService } from "../services/candidates.service";
import { kekaApplicationsService } from "../services/applications.service";
import { kekaInterviewsService } from "../services/interviews.service";
import { kekaOffersService } from "../services/offers.service";
import { kekaWorkflowService } from "../services/workflow.service";
import { query } from "../../../lib/db";

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
            keka_status = EXCLUDED.keka_status,
            job_id = EXCLUDED.job_id,
            last_synced_at = NOW()
        `, [
          c.id,
          c.name,
          c.email,
          c.phone || null,
          c.jobTitle || "Candidate",
          c.aiScore || 0,
          c.aiScore || 0,
          c.experienceYears || 0,
          c.status || "active",
          c.source || "Keka Webhook",
          c.currentStage || "Applied",
          c.appliedDate || new Date().toISOString(),
          c.jobId || null,
          c.id,
          "Keka",
          "synced"
        ]);
        
        // Trigger automated screening if it is a new candidate
        if (eventType === "candidate.created" && (c.aiScore === undefined || c.aiScore === null)) {
          // Trigger async automated resume screening
          kekaWorkflowService.screenCandidate(c.id).catch(err => {
            console.error(`❌ Automated screening failed for candidate ${c.id}:`, err);
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
