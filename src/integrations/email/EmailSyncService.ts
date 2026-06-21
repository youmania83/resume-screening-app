// src/integrations/email/EmailSyncService.ts
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { EmailSyncManager } from "./EmailProvider.js";
import { StorageManager } from "../../lib/storage/StorageProvider.js";
import { IngestQueue } from "../../lib/queue/ingestQueue.js";
import { queryGlobal } from "../../lib/tenantDb.js";

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

      for (const email of emails) {
        let processedAtLeastOneAttachment = false;

        for (const attach of email.attachments) {
          const startTime = Date.now();
          const inboxId = crypto.randomUUID();
          
          // 1. Security Check: File Size
          const maxSizeBytes = 25 * 1024 * 1024; // 25 MB default
          if (attach.content.length > maxSizeBytes) {
            console.warn(`[Email Sync] Attachment ${attach.fileName} rejected: Size exceeds 25MB`);
            await this.logAudit(tenantId, inboxId, "Upload", "Failed", provider.name, Date.now() - startTime, "File size exceeds 25 MB");
            continue;
          }

          // 2. Security Check: Invalid extension scanning
          const ext = path.extname(attach.fileName).toLowerCase();
          const acceptedExts = [".pdf", ".docx", ".doc", ".txt"];
          const blacklistedExts = [".exe", ".js", ".bat", ".cmd", ".scr"];

          if (blacklistedExts.includes(ext) || !acceptedExts.includes(ext)) {
            console.warn(`[Email Sync] Attachment ${attach.fileName} rejected: Unsupported or dangerous file format`);
            await this.logAudit(tenantId, inboxId, "Upload", "Failed", provider.name, Date.now() - startTime, "Unsupported or dangerous file extension");
            continue;
          }

          // 3. Upload attachment to Object Storage
          const storageMeta = await storage.uploadFile(tenantId, attach.fileName, attach.content);
          await this.logAudit(tenantId, inboxId, "Storage", "Success", provider.name, Date.now() - startTime);

          // Calculate file hash for duplicate detection
          const fileHash = crypto.createHash("md5").update(attach.content).digest("hex");

          // 4. Create resume_inbox record
          await queryGlobal(
            `INSERT INTO resume_inbox (id, tenant_id, file_name, file_url, file_hash, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, 'Queued', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
            [inboxId, tenantId, attach.fileName, storageMeta.fileUrl, fileHash]
          );

          // Write temp file on disk for parsing worker
          const tempPath = path.resolve("uploads", `${inboxId}${ext}`);
          await fs.promises.writeFile(tempPath, attach.content);

          // 5. Enqueue parsing job
          await IngestQueue.enqueue(tenantId, inboxId, tempPath, attach.mimeType);
          
          processedAtLeastOneAttachment = true;
          ingestedCount++;
        }

        // Mark email as read if we successfully enqueued its attachments
        if (processedAtLeastOneAttachment) {
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
