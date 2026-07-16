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

    // Identify orphaned files
    const orphanedFiles: Array<{ fileKey: string; sizeBytes: number; tenantId: string }> = [];
    for (const file of allFiles) {
      const { fileKey, sizeBytes } = file;

      let isReferenced = false;
      for (const url of dbUrls) {
        if (url.includes(fileKey)) {
          isReferenced = true;
          break;
        }
      }

      if (!isReferenced) {
        let tenantId = "unknown";
        const parts = fileKey.split("/");
        if (parts[0] === "mock" && parts.length >= 3) {
          tenantId = parts[1];
        } else if (parts.length >= 2) {
          tenantId = parts[0];
        }
        orphanedFiles.push({ fileKey, sizeBytes, tenantId });
      }
    }

    if (orphanedFiles.length === 0) {
      return { deletedCount: 0, bytesFreed: 0 };
    }

    // Query valid tenant IDs in bulk
    const uniqueTenantIds = Array.from(new Set(orphanedFiles.map(f => f.tenantId)));
    const tenantExistsRes = await queryGlobal(
      "SELECT id FROM tenants WHERE id = ANY($1)",
      [uniqueTenantIds]
    );
    const validTenantsSet = new Set(tenantExistsRes.rows.map(r => r.id));

    let deletedCount = 0;
    let bytesFreed = 0;

    const tenantUsageUpdates = new Map<string, { bytes: number; count: number }>();
    const auditLogsToInsert: any[][] = [];

    // 3. Identify and delete orphaned files
    for (const file of orphanedFiles) {
      const { fileKey, sizeBytes, tenantId } = file;
      const validTenantId = validTenantsSet.has(tenantId) ? tenantId : null;

      try {
        // Delete from storage provider
        await provider.deleteFile(tenantId, fileKey);

        const auditId = crypto.randomUUID();
        auditLogsToInsert.push([
          auditId,
          validTenantId,
          fileKey,
          providerName,
          "PRUNE",
          null,
          sizeBytes
        ]);

        if (validTenantId) {
          const current = tenantUsageUpdates.get(validTenantId) || { bytes: 0, count: 0 };
          tenantUsageUpdates.set(validTenantId, {
            bytes: current.bytes + sizeBytes,
            count: current.count + 1
          });
        }

        deletedCount++;
        bytesFreed += sizeBytes;
        console.log(`[StoragePruningService] Pruned orphaned file key: ${fileKey} (${sizeBytes} bytes) for tenant: ${tenantId}`);
      } catch (error) {
        console.error(`[StoragePruningService] Failed to prune file key ${fileKey}:`, error);
      }
    }

    // Bulk insert audit logs
    if (auditLogsToInsert.length > 0) {
      try {
        const flatValues: any[] = [];
        const placeholders: string[] = [];
        let paramIndex = 1;

        for (const row of auditLogsToInsert) {
          placeholders.push(`($${paramIndex}, $${paramIndex+1}, $${paramIndex+2}, $${paramIndex+3}, $${paramIndex+4}, $${paramIndex+5}, $${paramIndex+6})`);
          flatValues.push(...row);
          paramIndex += 7;
        }

        await queryGlobal(
          `INSERT INTO storage_audit_logs (id, tenant_id, file_key, provider, action, deleted_by, bytes_freed)
           VALUES ${placeholders.join(", ")}`,
          flatValues
        );
      } catch (insertErr) {
        console.error("[StoragePruningService] Failed to write storage audit logs in bulk:", insertErr);
      }
    }

    // Aggregated updates for usage summary
    for (const [tenantId, update] of tenantUsageUpdates.entries()) {
      try {
        await TenantUsageService.decrementMetric(tenantId, "storage_used", update.bytes);
        await TenantUsageService.decrementMetric(tenantId, "storage_files_count", update.count);
      } catch (usageErr) {
        console.error(`[StoragePruningService] Failed to update usage summary for tenant ${tenantId}:`, usageErr);
      }
    }

    return { deletedCount, bytesFreed };
  }
}
