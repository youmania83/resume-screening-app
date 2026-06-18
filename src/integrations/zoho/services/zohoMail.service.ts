// src/integrations/zoho/services/zohoMail.service.ts

import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { getZohoAdapter } from "../adapters";
import { query } from "../../../lib/db";
import { kekaWorkflowService } from "../../keka/services/workflow.service";

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

      // 2. Fetch active jobs to map candidates based on email subject
      const jobsRes = await query("SELECT id, title FROM jobs");
      const activeJobs = jobsRes.rows;

      const uploadsDir = path.join(process.cwd(), "uploads");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      for (const msg of emailMessages) {
        try {
          // 3. Prevent duplicate syncs by checking external_id + source_system
          const dupRes = await query(
            "SELECT id FROM candidates WHERE external_id = $1 AND source_system = 'Zoho Mail'",
            [msg.id]
          );

          if (dupRes.rowCount && dupRes.rowCount > 0) {
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

          // 5. Insert Candidate record first to satisfy foreign key constraints
          await query(
            `INSERT INTO candidates (
              id, name, email, phone, role, score, match_percent, experience_years, 
              status, application_source, assessment_score, keka_status, applied_date, 
              job_id, external_id, source_system, sync_status, last_synced_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())`,
            [
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
              "pending"
            ]
          );

          let resumeSaved = false;
          let savedFilename = "";

          // 6. Extract and save the first valid resume attachment
          if (msg.attachments && msg.attachments.length > 0) {
            for (const attachment of msg.attachments) {
              const ext = path.extname(attachment.filename).toLowerCase();
              const isDoc = [".pdf", ".docx", ".doc", ".txt"].includes(ext);
              
              if (isDoc && !resumeSaved) {
                const finalExt = ext || ".pdf";
                const relativePath = `uploads/resume-${candidateId}${finalExt}`;
                const destPath = path.join(process.cwd(), relativePath);
                
                // Write buffer to local uploads directory
                fs.writeFileSync(destPath, attachment.content);
                resumeSaved = true;
                savedFilename = attachment.filename;

                // Create document entry
                const docId = `doc-zoho-${uuidv4()}`;
                await query(
                  `INSERT INTO documents (
                    id, candidate_id, title, file_url, document_type, uploaded_at, external_id, source_system, sync_status, last_synced_at
                  )
                  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
                  [
                    docId,
                    candidateId,
                    attachment.filename,
                    `/${relativePath}`,
                    "Resume",
                    new Date(msg.date),
                    `${msg.id}-${attachment.filename}`,
                    "Zoho Mail",
                    "synced"
                  ]
                );
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
            await query(
              `INSERT INTO documents (
                id, candidate_id, title, file_url, document_type, uploaded_at, external_id, source_system, sync_status, last_synced_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
              [
                docId,
                candidateId,
                savedFilename,
                `/${relativePath}`,
                "Resume",
                new Date(msg.date),
                `${msg.id}-placeholder`,
                "Zoho Mail",
                "synced"
              ]
            );
          }

          // 7. Insert Application record
          await query(
            `INSERT INTO applications (
              id, candidate_id, job_id, application_date, status, stage, source, external_id, source_system, sync_status, last_synced_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
            [
              applicationId,
              candidateId,
              jobId,
              msg.date,
              "active",
              "Applied",
              "Zoho Mail",
              msg.id,
              "Zoho Mail",
              "synced"
            ]
          );

          // 8. Log Candidate activity
          await query(
            `INSERT INTO candidate_activity_logs (candidate_id, event_type, message)
            VALUES ($1, 'applied', $2)`,
            [candidateId, "Candidate applied via Zoho Mail email sourcing and resume inbox synchronization."]
          );

          // 9. Fire AI Screening workflow asynchronously
          kekaWorkflowService.screenCandidate(candidateId)
            .then(result => {
              console.log(`🤖 Auto AI Screening complete for Zoho candidate ${candidateId}: Stage = ${result.targetStage}, Score = ${result.score}`);
            })
            .catch(err => {
              console.error(`❌ Auto AI Screening failed for Zoho candidate ${candidateId}:`, err);
            });

          syncedCandidatesCount++;
        } catch (innerErr: any) {
          console.error(`Error processing email message ${msg.id}:`, innerErr);
          errors.push(`Message ${msg.id}: ${innerErr.message || innerErr}`);
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
