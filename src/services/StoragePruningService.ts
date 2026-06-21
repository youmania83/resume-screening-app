// src/services/StoragePruningService.ts
import crypto from "crypto";
import { StorageManager } from "../lib/storage/StorageProvider.js";
import { queryGlobal } from "../lib/tenantDb.js";
import { TenantUsageService } from "./TenantUsageService.js";

export class StoragePruningService {
  /**
   * Run the pruning job to identify and delete files from the storage provider
   * that are not referenced in the database (resume_inbox, documents, candidate_documents).
   * Logs all deleted files in storage_audit_logs.
   */
  static async pruneOrphanedFiles(): Promise<{ deletedCount: number; bytesFreed: number }> {
    const provider = StorageManager.getProvider();
    const providerName = process.env.STORAGE_PROVIDER || "local";

    // 1. Get all files currently stored in the storage provider
    const allFiles = await provider.listAllFiles();
    if (allFiles.length === 0) {
      return { deletedCount: 0, bytesFreed: 0 };
    }

    // 2. Query all referenced file URLs from the database
    const dbUrlsRes = await queryGlobal(`
      SELECT file_url FROM resume_inbox
      UNION
      SELECT file_url FROM documents
      UNION
      SELECT file_url FROM candidate_documents
    `);
    
    const dbUrls = new Set<string>();
    for (const row of dbUrlsRes.rows) {
      if (row.file_url) {
        dbUrls.add(row.file_url);
      }
    }

    let deletedCount = 0;
    let bytesFreed = 0;

    // 3. Identify and delete orphaned files
    for (const file of allFiles) {
      const { fileKey, sizeBytes } = file;

      // Check if this fileKey is referenced in any database URL
      let isReferenced = false;
      for (const url of dbUrls) {
        if (url.includes(fileKey)) {
          isReferenced = true;
          break;
        }
      }

      if (!isReferenced) {
        // Extract tenant ID from fileKey
        let tenantId = "unknown";
        const parts = fileKey.split("/");
        
        if (parts[0] === "mock" && parts.length >= 3) {
          tenantId = parts[1];
        } else if (parts.length >= 2) {
          tenantId = parts[0];
        }

        try {
          // Delete from storage provider
          await provider.deleteFile(tenantId, fileKey);

          // Log the pruning action in database
          const auditId = crypto.randomUUID();
          
          // Verify if tenant exists before adding reference, fallback to null/unknown if not
          const tenantExistsRes = await queryGlobal(
            "SELECT 1 FROM tenants WHERE id = $1 LIMIT 1",
            [tenantId]
          );
          const validTenantId = (tenantExistsRes.rowCount ?? 0) > 0 ? tenantId : null;

          await queryGlobal(
            `INSERT INTO storage_audit_logs (id, tenant_id, file_key, provider, action, deleted_by, bytes_freed)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [auditId, validTenantId, fileKey, providerName, "PRUNE", null, sizeBytes]
          );

          // If valid tenant, update usage summary statistics
          if (validTenantId) {
            await TenantUsageService.decrementMetric(validTenantId, "storage_used", sizeBytes);
            await TenantUsageService.decrementMetric(validTenantId, "storage_files_count", 1);
          }

          deletedCount++;
          bytesFreed += sizeBytes;
          console.log(`[StoragePruningService] Pruned orphaned file key: ${fileKey} (${sizeBytes} bytes) for tenant: ${tenantId}`);
        } catch (error) {
          console.error(`[StoragePruningService] Failed to prune file key ${fileKey}:`, error);
        }
      }
    }

    return { deletedCount, bytesFreed };
  }
}
