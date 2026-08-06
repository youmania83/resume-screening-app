// src/integrations/zoho/services/zohoMail.service.ts

import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { getZohoAdapter } from "../adapters/index.js";
import { query, transaction } from "../../../lib/db.js";
import { kekaWorkflowService } from "../../keka/services/workflow.service.js";
import { isNonResumeFile } from "../../../lib/fileFilters.js";
import { getIngestionCutoff } from "../../../lib/appConfig.js";
import { DEFAULT_TENANT_ID } from "../../../lib/tenantContext.js";
import { isLikelyApplicationEmail } from "../../../lib/emailClassification.js";
import { sendApplicationAcknowledgementEmail } from "../../../lib/email.js";

/**
 * Resolves the tenant that inbound Zoho Mail applications belong to.
 *
 * This sync runs from a single shared mailbox, outside any request context, so it
 * has no ambient tenant. Records were previously inserted with a NULL tenant_id,
 * which made them invisible to every tenant-scoped dashboard query — the
 * candidates existed in the database but never appeared in the UI.
 */
async function resolveSyncTenantId(): Promise<string> {
  try {
    const res = await query("SELECT id FROM tenants ORDER BY created_at ASC LIMIT 2;");
    if (res.rowCount === 1) {
      return res.rows[0].id;
    }
    if (res.rowCount && res.rowCount > 1) {
      const configured = process.env.ZOHO_SYNC_TENANT_ID;
      if (configured && res.rows.some((r: any) => r.id === configured)) {
        return configured;
      }
      console.warn(
        "[Zoho Mail Sync] Multiple tenants exist but ZOHO_SYNC_TENANT_ID is not set. " +
        `Defaulting to ${res.rows[0].id}. Set ZOHO_SYNC_TENANT_ID to route this mailbox explicitly.`
      );
      return res.rows[0].id;
    }
  } catch (err: any) {
    console.error("[Zoho Mail Sync] Failed to resolve the sync tenant:", err.message);
  }
  return DEFAULT_TENANT_ID;
}

// Helper for bulk insertions
async function bulkInsert(client: any, table: string, columns: string[], rows: any[][]) {
  if (rows.length === 0) return;
  const placeholders: string[] = [];
  const flatValues: any[] = [];
  let paramIndex = 1;

  for (const row of rows) {
    const rowPlaceholders: string[] = [];
    for (let i = 0; i < row.length; i++) {
      rowPlaceholders.push(`$${paramIndex++}`);
      flatValues.push(row[i]);
    }
    placeholders.push(`(${rowPlaceholders.join(", ")})`);
  }

  const queryText = `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders.join(", ")}`;
  await client.query(queryText, flatValues);
}

export class ZohoMailService {
  private getAdapter() {
    return getZohoAdapter();
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    return this.getAdapter().sendEmail(to, subject, html);
  }

  async syncInbox(): Promise<{ syncedCandidatesCount: number; errors: string[] }> {
    console.log("📥 Starting Zoho Mail inbox sync flow...");
    const errors: string[] = [];
    let syncedCandidatesCount = 0;

    try {
      // 1. Fetch incoming email applications
      const emailMessages = await this.getAdapter().fetchIncomingEmails();
      console.log(`Found ${emailMessages.length} potential candidate email applications.`);

      if (emailMessages.length === 0) {
        return { syncedCandidatesCount: 0, errors };
      }

      // 2. Fetch active jobs to map candidates based on email subject.
      // Only OPEN openings: applications must never be mapped onto a job that HR
      // closed or that the ATS sync removed.
      const jobsRes = await query(
        `SELECT id, title, location, job_code, external_id FROM jobs
          WHERE COALESCE(status, 'active') = 'active'
            AND sync_status IS DISTINCT FROM 'removed';`
      );
      const activeJobs = jobsRes.rows;

      if (activeJobs.length === 0) {
        console.warn("[Zoho Mail Sync] No open job openings — incoming applications will not be mapped to a requisition.");
      }

      const uploadsDir = path.join(process.cwd(), "uploads");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      // 3. Batch query existing candidate mappings to check duplicate syncs
      const msgIds = emailMessages.map(msg => msg.id);
      const dupRes = await query(
        "SELECT external_id FROM candidates WHERE external_id = ANY($1) AND source_system = 'Zoho Mail'",
        [msgIds]
      );
      const existingMsgIds = new Set(dupRes.rows.map(row => row.external_id));

      const candidatesToInsert: any[][] = [];
      const documentsToInsert: any[][] = [];
      const applicationsToInsert: any[][] = [];
      const logsToInsert: any[][] = [];
      const candidateIdsToScreen: string[] = [];
      const candidatesToAcknowledge: { candidateId: string; name: string; email: string; appliedDate: Date }[] = [];

      // Only ingest applications received at/after the configured cutoff. The
      // IMAP path (EmailSyncService) already enforced this; this OAuth path did
      // not, so the two ingestion routes disagreed and this one kept pulling in
      // historical backlog.
      const cutoff = getIngestionCutoff();
      const syncTenantId = await resolveSyncTenantId();

      for (const msg of emailMessages) {
        try {
          if (existingMsgIds.has(msg.id)) {
            console.log(`Candidate application from email message ${msg.id} already synced. Skipping.`);
            continue;
          }

          const msgTime = msg.date ? new Date(msg.date).getTime() : NaN;
          if (isNaN(msgTime)) {
            console.log(`[Zoho Mail Sync] Skipping message ${msg.id}: missing or unparseable date.`);
            continue;
          }
          if (msgTime < cutoff.getTime()) {
            console.log(`[Zoho Mail Sync] Skipping message ${msg.id} received before the ${cutoff.toISOString()} cutoff.`);
            continue;
          }

          // 3a. Relevance filter: this mailbox receives more than just applications
          // (newsletters, vendor mail, out-of-office replies, internal notes). Unlike
          // the IMAP path (EmailSyncService), this OAuth path previously had no
          // classification step at all and turned any unread message into a
          // candidate record. Skip anything that doesn't look like an application.
          const attachmentNames = (msg.attachments || []).map(a => a.filename);
          if (!isLikelyApplicationEmail(msg.subject, attachmentNames)) {
            console.log(`[Zoho Mail Sync] Skipping message ${msg.id} ("${msg.subject}"): does not look like a job application.`);
            continue;
          }

          // 3b. Cross-channel dedup by email / phone. Other ingestion paths already
          // check this (resumeWorker.ts, the Keka webhook); this OAuth path only
          // checked its own external_id, so a repeat applicant via this channel (or
          // one who also applied through another channel) got a second candidate row.
          if (msg.fromEmail) {
            const emailDupRes = await query(
              "SELECT id FROM candidates WHERE tenant_id = $1 AND LOWER(email) = LOWER($2) LIMIT 1;",
              [syncTenantId, msg.fromEmail]
            );
            if ((emailDupRes.rowCount || 0) > 0) {
              const existingCandidateId = emailDupRes.rows[0].id;
              console.log(`[Zoho Mail Sync] Skipping message ${msg.id}: ${msg.fromEmail} already exists as candidate ${existingCandidateId}.`);
              await query(
                `INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id)
                 VALUES ($1, 'application_received', $2, $3);`,
                [existingCandidateId, `Additional application email received via Zoho Mail (message ${msg.id}). Not created as a duplicate candidate record.`, syncTenantId]
              );
              continue;
            }
          }

          // 4. Map candidate to a Job ID.
          //
          // Exact Job ID / job code / external ID match first (this is what the
          // user should be identified by whenever the application references
          // it). Only fall back to title matching when no ID reference is
          // present, and even then, only auto-assign when the title identifies
          // exactly ONE active posting — multiple open roles can share a title
          // at different locations (e.g. several "Project Engineer" openings),
          // and guessing between them via first-match previously collapsed
          // every applicant onto whichever posting happened to sync first,
          // regardless of the specific opening (Job ID) they actually applied to.
          let jobId: string | null = null;
          let matchedRole = "Candidate";
          const subjectLower = msg.subject.toLowerCase();
          const bodyLower = (msg.body || "").toLowerCase();
          const haystack = `${subjectLower}\n${bodyLower}`;

          for (const job of activeJobs) {
            const refs = [job.id, job.job_code, job.external_id].filter((v): v is string => !!v && String(v).trim().length > 0);
            const matchedRef = refs.find(ref => haystack.includes(String(ref).trim().toLowerCase()));
            if (matchedRef) {
              jobId = job.id;
              matchedRole = job.title;
              break;
            }
          }

          if (!jobId) {
            const titleMatches = activeJobs.filter(job => subjectLower.includes(job.title.toLowerCase()));
            if (titleMatches.length === 1) {
              jobId = titleMatches[0].id;
              matchedRole = titleMatches[0].title;
            } else if (titleMatches.length > 1) {
              const withLocation = titleMatches.find(job => {
                const loc = (job.location || "").toLowerCase().trim();
                const city = loc.split(",")[0].trim();
                return city && loc !== "remote" && haystack.includes(city);
              });
              if (withLocation) {
                jobId = withLocation.id;
                matchedRole = withLocation.title;
              } else {
                console.warn(`[Zoho Mail Sync] Subject "${msg.subject}" matches ${titleMatches.length} active postings with the same title and no location/Job ID could disambiguate. Leaving unmapped for HR review.`);
              }
            }
          }

          // NOTE: there is deliberately NO "fall back to the first available job".
          // That fallback assigned every unmatched application to whichever
          // requisition happened to be first in the result set, producing wrong
          // role mappings and wrong assessments. An unmatched application is left
          // with job_id NULL so the screening worker can match it on resume
          // content, or route it to HR review.
          if (!jobId) {
            console.log(`[Zoho Mail Sync] No job title matched in subject "${msg.subject}". Leaving unmapped for content-based matching / HR review.`);
          }

          const candidateId = `cand-zoho-${uuidv4()}`;
          const applicationId = `app-zoho-${uuidv4()}`;

          // Prepare candidate insert row.
          // Score starts at 0 — NOT a fabricated 60 baseline. A hard-coded 60 sat
          // exactly on the HR-review threshold, so unscreened candidates appeared
          // pre-qualified before the AI had evaluated anything. The real score is
          // written by the screening worker.
          candidatesToInsert.push([
            candidateId,
            msg.fromName,
            msg.fromEmail,
            null, // Phone placeholder, extracted by AI parser
            matchedRole,
            0, // Score — assigned by AI screening, not guessed here
            0, // Match percent — assigned by AI screening
            0, // Experience years
            "applied",
            "Zoho Mail",
            null,
            "Applied",
            msg.date.toISOString(),
            jobId,
            msg.id,
            "Zoho Mail",
            "pending",
            new Date(),
            syncTenantId
          ]);

          let resumeSaved = false;
          let savedFilename = "";

          // 6. Extract and save the first valid resume attachment
          if (msg.attachments && msg.attachments.length > 0) {
            for (const attachment of msg.attachments) {
              const ext = path.extname(attachment.filename).toLowerCase();
              const isIgnored = isNonResumeFile(attachment.filename);
              const isDoc = [".pdf", ".docx", ".doc", ".txt"].includes(ext) && !isIgnored;
              
              if (isDoc && !resumeSaved) {
                const finalExt = ext || ".pdf";
                const relativePath = `uploads/resume-${candidateId}${finalExt}`;
                const destPath = path.join(process.cwd(), relativePath);
                
                // Write buffer to local uploads directory
                fs.writeFileSync(destPath, attachment.content);
                resumeSaved = true;
                savedFilename = attachment.filename;

                const docId = `doc-zoho-${uuidv4()}`;
                documentsToInsert.push([
                  docId,
                  candidateId,
                  attachment.filename,
                  `/${relativePath}`,
                  "Resume",
                  new Date(msg.date),
                  `${msg.id}-${attachment.filename}`,
                  "Zoho Mail",
                  "synced",
                  new Date(),
                  syncTenantId
                ]);
              }
            }
          }

          // If no resume attachment is provided, record the application WITHOUT a
          // resume document and leave it for HR review.
          //
          // Previously this wrote a fake PDF containing invented text
          // ("Experience: 3 years. General skills.") purely so the parser would
          // run. The AI then dutifully extracted those invented details, and the
          // candidate was scored and progressed on fabricated data. Never
          // synthesise resume content.
          if (!resumeSaved) {
            console.warn(`[Zoho Mail Sync] Application from ${msg.fromEmail} has no usable resume attachment. Recorded for HR review; no resume document created.`);

            logsToInsert.push([
              candidateId,
              "needs_review",
              "Application received via Zoho Mail with no readable resume attachment. Requires HR follow-up to obtain a resume before screening.",
              syncTenantId
            ]);
          }

          // 7. Prepare Application record
          applicationsToInsert.push([
            applicationId,
            candidateId,
            jobId,
            msg.date,
            "active",
            "Applied",
            "Zoho Mail",
            msg.id,
            "Zoho Mail",
            "synced",
            new Date(),
            syncTenantId
          ]);

          // 8. Prepare Candidate activity log
          logsToInsert.push([
            candidateId,
            "applied",
            "Candidate applied via Zoho Mail email sourcing and resume inbox synchronization.",
            syncTenantId
          ]);

          candidateIdsToScreen.push(candidateId);
          candidatesToAcknowledge.push({ candidateId, name: msg.fromName, email: msg.fromEmail, appliedDate: new Date(msg.date) });
          syncedCandidatesCount++;
        } catch (innerErr: any) {
          console.error(`Error processing email message ${msg.id}:`, innerErr);
          errors.push(`Message ${msg.id}: ${innerErr.message || innerErr}`);
        }
      }

      // Execute bulk writes inside a transaction
      if (syncedCandidatesCount > 0) {
        console.log(`[ZohoMailService] Bulk inserting ${syncedCandidatesCount} candidate records and related entities in a single transaction...`);
        await transaction(async (client) => {
          await bulkInsert(client, "candidates", [
            "id", "name", "email", "phone", "role", "score", "match_percent", "experience_years",
            "status", "application_source", "assessment_score", "keka_status", "applied_date",
            "job_id", "external_id", "source_system", "sync_status", "last_synced_at", "tenant_id"
          ], candidatesToInsert);

          await bulkInsert(client, "documents", [
            "id", "candidate_id", "title", "file_url", "document_type", "uploaded_at",
            "external_id", "source_system", "sync_status", "last_synced_at", "tenant_id"
          ], documentsToInsert);

          await bulkInsert(client, "applications", [
            "id", "candidate_id", "job_id", "application_date", "status", "stage",
            "source", "external_id", "source_system", "sync_status", "last_synced_at", "tenant_id"
          ], applicationsToInsert);

          await bulkInsert(client, "candidate_activity_logs", [
            "candidate_id", "event_type", "message", "tenant_id"
          ], logsToInsert);
        });

        // 9a. Send the application acknowledgement email. Previously this channel —
        // the primary live ingestion path whenever Zoho OAuth creds are configured —
        // never sent this email at all; only IMAP-fed uploads, manual add, and direct
        // upload did. sendApplicationAcknowledgementEmail enforces the acknowledgement
        // cutoff and once-per-candidate guard itself.
        for (const cand of candidatesToAcknowledge) {
          sendApplicationAcknowledgementEmail({
            candidateName: cand.name,
            candidateEmail: cand.email,
            tenantId: syncTenantId,
            candidateId: cand.candidateId,
            appliedDate: cand.appliedDate
          }).catch(err => {
            console.error(`❌ Failed to send application acknowledgement for Zoho candidate ${cand.candidateId}:`, err);
          });
        }

        // 9b. Fire AI Screening workflows asynchronously
        for (const candidateId of candidateIdsToScreen) {
          kekaWorkflowService.screenCandidate(candidateId)
            .then(result => {
              console.log(`🤖 Auto AI Screening complete for Zoho candidate ${candidateId}: Stage = ${result.targetStage}, Score = ${result.score}`);
            })
            .catch(err => {
              console.error(`❌ Auto AI Screening failed for Zoho candidate ${candidateId}:`, err);
            });
        }
      }
    } catch (err: any) {
      console.error("Fatal error during Zoho Mail syncInbox:", err);
      errors.push(`Fatal sync error: ${err.message || err}`);
    }

    return { syncedCandidatesCount, errors };
  }
}

export const zohoMailService = new ZohoMailService();
