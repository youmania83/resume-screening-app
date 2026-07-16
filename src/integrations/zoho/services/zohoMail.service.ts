// src/integrations/zoho/services/zohoMail.service.ts

import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { getZohoAdapter } from "../adapters";
import { query, transaction } from "../../../lib/db";
import { kekaWorkflowService } from "../../keka/services/workflow.service";

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

      // 2. Fetch active jobs to map candidates based on email subject
      const jobsRes = await query("SELECT id, title FROM jobs");
      const activeJobs = jobsRes.rows;

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

      for (const msg of emailMessages) {
        try {
          if (existingMsgIds.has(msg.id)) {
            console.log(`Candidate application from email message ${msg.id} already synced. Skipping.`);
            continue;
          }

          // 4. Map candidate to Job ID by searching for job title match in subject line (case-insensitive)
          let jobId: string | null = null;
          let matchedRole = "Candidate";

          for (const job of activeJobs) {
            if (msg.subject.toLowerCase().includes(job.title.toLowerCase())) {
              jobId = job.id;
              matchedRole = job.title;
              break;
            }
          }

          // Fallback to first available job if no match found
          if (!jobId && activeJobs.length > 0) {
            jobId = activeJobs[0].id;
            matchedRole = activeJobs[0].title;
          }

          const candidateId = `cand-zoho-${uuidv4()}`;
          const applicationId = `app-zoho-${uuidv4()}`;

          // Prepare candidate insert row
          candidatesToInsert.push([
            candidateId,
            msg.fromName,
            msg.fromEmail,
            null, // Phone placeholder, extracted by AI parser
            matchedRole,
            0, // AI Score calculated during workflow trigger
            0, // Match percent
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
            new Date()
          ]);

          let resumeSaved = false;
          let savedFilename = "";

          // 6. Extract and save the first valid resume attachment
          if (msg.attachments && msg.attachments.length > 0) {
            for (const attachment of msg.attachments) {
              const ext = path.extname(attachment.filename).toLowerCase();
              const lowerName = attachment.filename.toLowerCase();
              const ignoreKeywords = [
                "payslip", "pay slip", "pay_slip", "salary",
                "challan", "ecr", "gst", "tax", "audit", "balance", "ledger", "statement",
                "ticket", "boarding", "flight", "booking", "travel", "paid", "voucher",
                "invoice", "receipt", "bill", "payment", "transaction", "bank", "account details",
                "scan", "mri", "xray", "medical", "prescription",
                "tender", "agreement", "contract", "proposal",
                "issue", "incident", "log", "report", "reports",
                "program", "training", "certificate", "course",
                "signature", "logo", "image0",
                "aadhar", "pan", "passbook", "marksheet", "mark sheet", "mark_sheet", "degree", "diploma", "scorecard", "marklist", "passport", "photo", "visa", "gifting", "portfolio", "card", "q1", "q2", "q3", "q4", "2026-27", "2025-26", "2024-25"
              ];
              const hasCv = /(?:^|[^a-z])cv(?:$|[^a-z])/i.test(attachment.filename);
              const hasResumeKeyword = lowerName.includes("resume") || hasCv || lowerName.includes("curriculum");
              const isIgnored = (ignoreKeywords.some(kw => lowerName.includes(kw)) || lowerName.includes(" to ")) && !hasResumeKeyword;
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
                  new Date()
                ]);
              }
            }
          }

          // If no resume attachment is provided, create a blank placeholder file to allow parser logic to run
          if (!resumeSaved) {
            const relativePath = `uploads/resume-${candidateId}.pdf`;
            const destPath = path.join(process.cwd(), relativePath);
            fs.writeFileSync(
              destPath,
              Buffer.from(
                `%PDF Mock Resume Contents for ${msg.fromName}. Experience: 3 years. General skills. Candidate did not upload resume.`,
                "utf-8"
              )
            );
            savedFilename = "resume-placeholder.pdf";

            const docId = `doc-zoho-${uuidv4()}`;
            documentsToInsert.push([
              docId,
              candidateId,
              savedFilename,
              `/${relativePath}`,
              "Resume",
              new Date(msg.date),
              `${msg.id}-placeholder`,
              "Zoho Mail",
              "synced",
              new Date()
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
            new Date()
          ]);

          // 8. Prepare Candidate activity log
          logsToInsert.push([
            candidateId,
            "applied",
            "Candidate applied via Zoho Mail email sourcing and resume inbox synchronization."
          ]);

          candidateIdsToScreen.push(candidateId);
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
            "job_id", "external_id", "source_system", "sync_status", "last_synced_at"
          ], candidatesToInsert);

          await bulkInsert(client, "documents", [
            "id", "candidate_id", "title", "file_url", "document_type", "uploaded_at",
            "external_id", "source_system", "sync_status", "last_synced_at"
          ], documentsToInsert);

          await bulkInsert(client, "applications", [
            "id", "candidate_id", "job_id", "application_date", "status", "stage",
            "source", "external_id", "source_system", "sync_status", "last_synced_at"
          ], applicationsToInsert);

          await bulkInsert(client, "candidate_activity_logs", [
            "candidate_id", "event_type", "message"
          ], logsToInsert);
        });

        // 9. Fire AI Screening workflows asynchronously
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
