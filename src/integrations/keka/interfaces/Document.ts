// src/integrations/keka/interfaces/Document.ts

export interface KekaDocument {
  id: string;
  candidateId: string;
  title: string;
  fileUrl: string;
  documentType?: string; // e.g. resume, portfolio, onboarding, offerLetter
  uploadedAt?: Date | string;
  
  // Sync metadata fields
  external_id?: string;
  source_system?: string;
  sync_status?: string;
  last_synced_at?: Date | string;
}
