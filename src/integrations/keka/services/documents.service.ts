// src/integrations/keka/services/documents.service.ts

import fs from "fs";
import path from "path";
import { getKekaAdapter } from "../adapters";
import { KekaDocument } from "../interfaces/Document";
import { query } from "../../../lib/db";

export class KekaDocumentsService {
  private getAdapter() {
    return getKekaAdapter();
  }

  async getDocuments(candidateId: string): Promise<KekaDocument[]> {
    return this.getAdapter().getDocuments(candidateId);
  }

  async downloadResume(candidateId: string): Promise<Buffer> {
    const uploadsDir = path.join(process.cwd(), "uploads");
    const allowedExtensions = [".pdf", ".docx", ".doc", ".txt"];

    if (fs.existsSync(uploadsDir)) {
      for (const ext of allowedExtensions) {
        const filePath = path.join(uploadsDir, `resume-${candidateId}${ext}`);
        if (fs.existsSync(filePath)) {
          console.log(`📁 Found local resume for candidate ${candidateId} at ${filePath}`);
          return fs.readFileSync(filePath);
        }
      }
    }

    return this.getAdapter().downloadResume(candidateId);
  }

  async syncDocumentsFromKeka(candidateId: string): Promise<void> {
    const targetTenantId = process.env.TARGET_TENANT_ID || "87b949cb-2c0d-44ca-a6f5-a025ec43e6a5";
    const docs = await this.getDocuments(candidateId);
    for (const doc of docs) {
      await query(`
        INSERT INTO documents (id, tenant_id, candidate_id, title, file_url, document_type, uploaded_at, external_id, source_system, sync_status, last_synced_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (id) DO UPDATE SET
          tenant_id = EXCLUDED.tenant_id,
          title = EXCLUDED.title,
          file_url = EXCLUDED.file_url,
          document_type = EXCLUDED.document_type,
          last_synced_at = NOW()
      `, [
        doc.id,
        targetTenantId,
        doc.candidateId,
        doc.title,
        doc.fileUrl,
        doc.documentType || null,
        doc.uploadedAt || new Date(),
        doc.external_id || doc.id,
        doc.source_system || "Keka",
        "synced"
      ]);
    }
  }
}

export const kekaDocumentsService = new KekaDocumentsService();
