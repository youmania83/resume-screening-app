// src/integrations/keka/services/documents.service.ts

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
    return this.getAdapter().downloadResume(candidateId);
  }

  async syncDocumentsFromKeka(candidateId: string): Promise<void> {
    const docs = await this.getDocuments(candidateId);
    for (const doc of docs) {
      await query(`
        INSERT INTO documents (id, candidate_id, title, file_url, document_type, uploaded_at, external_id, source_system, sync_status, last_synced_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          file_url = EXCLUDED.file_url,
          document_type = EXCLUDED.document_type,
          last_synced_at = NOW()
      `, [
        doc.id,
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
