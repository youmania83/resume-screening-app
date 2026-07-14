// src/integrations/email/EmailSyncService.ts
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { EmailSyncManager } from "./EmailProvider.js";
import { StorageManager } from "../../lib/storage/StorageProvider.js";
import { IngestQueue } from "../../lib/queue/ingestQueue.js";
import { queryGlobal } from "../../lib/tenantDb.js";
import { JobExtractionService } from "../../services/JobExtractionService.js";
import { TenantUsageService } from "../../services/TenantUsageService.js";

// Global connection health ledger
export interface ProviderHealth {
  connected: boolean;
  lastSyncTime: Date | null;
  errorMessage?: string;
}

const providerHealthLedger: Record<string, ProviderHealth> = {
  gmail: { connected: false, lastSyncTime: null },
  outlook: { connected: false, lastSyncTime: null },
  zoho: { connected: false, lastSyncTime: null },
  imap: { connected: false, lastSyncTime: null },
  mock: { connected: true, lastSyncTime: null }
};

export class EmailSyncService {
  /**
   * Returns current health of email integrations
   */
  static getHealthStatus(): Record<string, ProviderHealth> {
    return providerHealthLedger;
  }

  /**
   * Performs an ingestion pass from a specified provider type under a tenant.
   */
  /**
   * Helper to execute a regex safely. Supports stripping inline modifiers like (?i)
   */
  private static matchRegex(pattern: string, text: string): RegExpMatchArray | null {
    try {
      let flags = "i"; // Default to case-insensitive
      let cleanPattern = pattern;
      if (pattern.startsWith("(?i)")) {
        cleanPattern = pattern.substring(4);
      }
      return text.match(new RegExp(cleanPattern, flags));
    } catch (err) {
      console.warn(`[Email Sync] Invalid regex pattern: ${pattern}`, err);
      return null;
    }
  }

  /**
   * Performs an ingestion pass from a specified provider type under a tenant.
   */
  static async syncMailbox(tenantId: string, providerType: string): Promise<number> {
    const key = providerType.toLowerCase();
    const provider = EmailSyncManager.getProvider(providerType);
    const storage = StorageManager.getProvider();
    
    let ingestedCount = 0;
    
    try {
      // Fetch unread emails
      const emails = await provider.fetchUnreadEmails();
      
      // Update health tracker
      providerHealthLedger[key] = {
        connected: true,
        lastSyncTime: new Date()
      };

      // Retrieve tenant specific configuration
      const tenantRes = await queryGlobal(
        "SELECT email_config FROM tenants WHERE id = $1 LIMIT 1;",
        [tenantId]
      );
      const emailConfig = tenantRes.rows[0]?.email_config || {};
      const rules = emailConfig.rules || [
        {
          type: "resume",
          subjectRegex: "(?i)applying\\s*for|job\\s*application|resume\\s*for|cv\\s*for",
          titleRegex: "(?i)(?:applying\\s*for|job\\s*application|resume\\s*for|cv\\s*for)\\s*[:-]?\\s*(.+)"
        },
        {
          type: "jd",
          subjectRegex: "(?i)job\\s*description|new\\s*jd|post\\s*job|hiring\\s*for",
          titleRegex: "(?i)(?:job\\s*description|new\\s*jd|post\\s*job|hiring\\s*for)\\s*[:-]?\\s*(.+)"
        }
      ];

      for (const email of emails) {
        const subject = email.subject || "";
        const body = email.bodyText || email.bodyHtml || "";
        
        // 1. Classify the email based on subject line regex rules
        let matchedRule: any = null;
        let jobTitleExtracted = "";

        for (const rule of rules) {
          const isMatch = this.matchRegex(rule.subjectRegex, subject);
          if (isMatch) {
            matchedRule = rule;
            if (rule.titleRegex) {
              const titleMatch = this.matchRegex(rule.titleRegex, subject);
              if (titleMatch && titleMatch[1]) {
                jobTitleExtracted = titleMatch[1].trim();
              }
            }
            break;
          }
        }

        // Fallback: If unclassified but contains attachments, assume candidate application
        if (!matchedRule && email.attachments && email.attachments.length > 0) {
          matchedRule = { type: "resume" };
        }

        // 2. Process according to classification
        if (matchedRule && matchedRule.type === "jd") {
          // PATH A: Ingest Job Description (JD)
          console.log(`[Email Sync] Ingesting Job Description from email: "${subject}"`);
          const jdExtract = await JobExtractionService.extractFromEmail(subject, body);
          const jobId = crypto.randomUUID();

          await queryGlobal(
            `INSERT INTO jobs (id, tenant_id, title, description, department, location, experience_required, jd, skills, work_mode)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
            [
              jobId,
              tenantId,
              jdExtract.title,
              jdExtract.description,
              jdExtract.department || "Engineering",
              jdExtract.location || "Remote",
              jdExtract.experienceRequired || "Not Specified",
              JSON.stringify(jdExtract),
              jdExtract.skills || [],
              jdExtract.workMode || "Remote"
            ]
          );

          await TenantUsageService.incrementMetric(tenantId, "active_jobs", 1);
          await provider.markAsRead(email.id);
          ingestedCount++;
          console.log(`[Email Sync] Job Ingest Success: "${jdExtract.title}" (ID: ${jobId})`);
          continue;
        }

        // PATH B: Process Resume Application
        console.log(`[Email Sync] Processing candidate application email: "${subject}"`);
        let targetJobId: string | undefined = undefined;

        if (jobTitleExtracted) {
          const jobMatchRes = await queryGlobal(
            `SELECT id FROM jobs 
             WHERE tenant_id = $1 AND (LOWER(title) = LOWER($2) OR LOWER(title) LIKE LOWER($3))
             LIMIT 1;`,
            [tenantId, jobTitleExtracted, `%${jobTitleExtracted}%`]
          );
          if (jobMatchRes.rowCount && jobMatchRes.rowCount > 0) {
            targetJobId = jobMatchRes.rows[0].id;
          }
        }

        let processedAtLeastOneResume = false;

        // B1. Process attachments
        for (const attach of email.attachments) {
          const startTime = Date.now();
          const inboxId = crypto.randomUUID();
          
          // Security Check: File Size
          const maxSizeBytes = 25 * 1024 * 1024;
          if (attach.content.length > maxSizeBytes) {
            console.warn(`[Email Sync] Attachment ${attach.fileName} rejected: Size exceeds 25MB`);
            await this.logAudit(tenantId, inboxId, "Upload", "Failed", provider.name, Date.now() - startTime, "File size exceeds 25 MB");
            continue;
          }

          // Security Check: Extensions
          const ext = path.extname(attach.fileName).toLowerCase();
          const acceptedExts = [".pdf", ".docx", ".doc", ".txt"];
          const blacklistedExts = [".exe", ".js", ".bat", ".cmd", ".scr"];

          if (blacklistedExts.includes(ext) || !acceptedExts.includes(ext)) {
            console.warn(`[Email Sync] Attachment ${attach.fileName} rejected: Unsupported or dangerous file format`);
            await this.logAudit(tenantId, inboxId, "Upload", "Failed", provider.name, Date.now() - startTime, "Unsupported or dangerous file extension");
            continue;
          }

          // Skip non-resume files like payslips, challans, offer letters, tickets, etc.
          const lowerName = attach.fileName.toLowerCase();
          const ignoreKeywords = ["payslip", "pay slip", "pay_slip", "challan", "ecr", "ticket", "boarding", "offer letter", "offer_letter", "invoice", "receipt", "bill", "signature", "logo", "image00"];
          if (ignoreKeywords.some(keyword => lowerName.includes(keyword))) {
            console.log(`[Email Sync] Skipping non-resume attachment: "${attach.fileName}"`);
            continue;
          }


          // Upload to storage
          const storageMeta = await storage.uploadFile(tenantId, attach.fileName, attach.content);
          await this.logAudit(tenantId, inboxId, "Storage", "Success", provider.name, Date.now() - startTime);

          const fileHash = crypto.createHash("md5").update(attach.content).digest("hex");

          await queryGlobal(
            `INSERT INTO resume_inbox (id, tenant_id, file_name, file_url, file_hash, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, 'Queued', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
            [inboxId, tenantId, attach.fileName, storageMeta.fileUrl, fileHash]
          );

          const tempPath = path.resolve("uploads", `${inboxId}${ext}`);
          await fs.promises.writeFile(tempPath, attach.content);

          await IngestQueue.enqueue(tenantId, inboxId, tempPath, attach.mimeType, targetJobId);
          processedAtLeastOneResume = true;
          ingestedCount++;
        }

        // B2. If no attachments, search email body for resume links
        if (email.attachments.length === 0) {
          const urlRegex = /(https?:\/\/(?:drive\.google\.com|dropbox\.com|onedrive\.live\.com|docs\.google\.com)\/[^\s"'>]+)/gi;
          const links = body.match(urlRegex);

          if (links && links.length > 0) {
            console.log(`[Email Sync] Extracted ${links.length} potential resume link(s) from email body.`);
            for (const link of links) {
              const inboxId = crypto.randomUUID();
              
              // Attempt public download
              const downloadRes = await EmailSyncService.tryDownloadPublicCloudFile(link, inboxId);

              if (downloadRes.success && downloadRes.filePath && downloadRes.mimeType) {
                await queryGlobal(
                  `INSERT INTO resume_inbox (id, tenant_id, file_name, file_url, status, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, 'Queued', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
                  [inboxId, tenantId, downloadRes.fileName, link]
                );

                await IngestQueue.enqueue(tenantId, inboxId, downloadRes.filePath, downloadRes.mimeType, targetJobId);
              } else {
                // Fallback to url record
                await queryGlobal(
                  `INSERT INTO resume_inbox (id, tenant_id, file_name, file_url, status, error_message, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, 'Queued', $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
                  [
                    inboxId, 
                    tenantId, 
                    `Cloud_Resume_${inboxId}.url`, 
                    link, 
                    "Cloud resume link detected in email body."
                  ]
                );

                const ext = ".txt";
                const textContent = `Resume Link: ${link}\nSender: ${email.sender}\nSubject: ${subject}\n\nEmail Body:\n${body}`;
                const tempPath = path.resolve("uploads", `${inboxId}${ext}`);
                await fs.promises.writeFile(tempPath, Buffer.from(textContent));

                await IngestQueue.enqueue(tenantId, inboxId, tempPath, "text/plain", targetJobId);
              }

              processedAtLeastOneResume = true;
              ingestedCount++;
            }
          }
        }

        // Mark email as read if any resume enqueued or JD created
        if (processedAtLeastOneResume) {
          await provider.markAsRead(email.id);
        }
      }
    } catch (err: any) {
      console.error(`[Email Sync] Sync error on provider ${providerType}:`, err);
      providerHealthLedger[key] = {
        connected: false,
        lastSyncTime: providerHealthLedger[key]?.lastSyncTime || null,
        errorMessage: err.message || "Connection failed"
      };
    }

    return ingestedCount;
  }

  private static async tryDownloadPublicCloudFile(
    link: string, 
    inboxId: string
  ): Promise<{ success: boolean; filePath?: string; mimeType?: string; fileName?: string }> {
    try {
      let downloadUrl = "";
      let ext = ".pdf";
      let mimeType = "application/pdf";
      let fileName = `Cloud_Resume_${inboxId}.pdf`;

      // 1. Google Drive File
      const gdMatch = link.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
      if (gdMatch) {
        const fileId = gdMatch[1];
        downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      }

      // 2. Google Docs
      const gdocsMatch = link.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/i);
      if (gdocsMatch) {
        const docId = gdocsMatch[1];
        downloadUrl = `https://docs.google.com/document/d/${docId}/export?format=pdf`;
      }

      // 3. Dropbox
      if (link.includes("dropbox.com")) {
        // Convert standard sharing link to direct download link
        downloadUrl = link.replace("www.dropbox.com", "dl.dropboxusercontent.com");
        // Remove dl=0 or similar query params
        downloadUrl = downloadUrl.split("?")[0];
        if (downloadUrl.toLowerCase().endsWith(".docx")) {
          ext = ".docx";
          mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
          fileName = `Cloud_Resume_${inboxId}.docx`;
        }
      }

      if (!downloadUrl) {
        return { success: false };
      }

      console.log(`[Email Sync] Attempting public download from: ${downloadUrl}`);
      const response = await fetch(downloadUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });

      if (!response.ok) {
        console.log(`[Email Sync] Public download failed with status ${response.status}`);
        return { success: false };
      }

      const contentType = response.headers.get("content-type") || "";
      // If it's returning HTML, it probably redirected to a login/cookie wall page
      if (contentType.includes("text/html")) {
        console.log(`[Email Sync] Download url returned HTML, likely blocked by authentication wall`);
        return { success: false };
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const tempPath = path.resolve("uploads", `${inboxId}${ext}`);
      
      // Ensure uploads directory exists
      if (!fs.existsSync("uploads")) {
        fs.mkdirSync("uploads");
      }
      
      await fs.promises.writeFile(tempPath, buffer);

      // Guess extension/mimetype from content-type if available
      let resolvedMime = mimeType;
      if (contentType.includes("pdf")) {
        resolvedMime = "application/pdf";
      } else if (contentType.includes("word") || contentType.includes("officedocument")) {
        resolvedMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      }

      return {
        success: true,
        filePath: tempPath,
        mimeType: resolvedMime,
        fileName
      };
    } catch (err) {
      console.warn(`[Email Sync] Error downloading cloud resume file:`, err);
      return { success: false };
    }
  }

  private static async logAudit(
    tenantId: string,
    inboxId: string,
    step: string,
    status: string,
    provider: string,
    durationMs: number,
    errorMessage?: string
  ): Promise<void> {
    const logId = crypto.randomUUID();
    try {
      await queryGlobal(
        `INSERT INTO resume_processing_logs (id, tenant_id, inbox_id, step, status, provider, duration_ms, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
        [logId, tenantId, inboxId, step, status, provider, durationMs, errorMessage || null]
      );
    } catch (err) {
      console.error("[Email Sync] Failed to write processing logs:", err);
    }
  }
}
