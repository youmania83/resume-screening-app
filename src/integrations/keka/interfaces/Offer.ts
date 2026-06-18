// src/integrations/keka/interfaces/Offer.ts

export interface KekaOffer {
  id: string;
  candidateId: string;
  jobId: string;
  salary: string;
  joiningDate: Date | string;
  status: string; // e.g. draft, sent, accepted, declined
  offerLetterUrl?: string;
  
  // Sync metadata fields
  external_id?: string;
  source_system?: string;
  sync_status?: string;
  last_synced_at?: Date | string;
}
