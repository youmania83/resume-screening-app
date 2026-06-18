// src/integrations/keka/interfaces/Application.ts

export interface KekaApplication {
  id: string;
  candidateId: string;
  jobId: string;
  applicationDate: Date | string;
  status: string; // e.g. active, hired, rejected
  stage: string;  // Current stage in the pipeline
  source?: string; // e.g. LinkedIn, Referral, Careers Portal
  
  // Sync metadata fields
  external_id?: string;
  source_system?: string;
  sync_status?: string;
  last_synced_at?: Date | string;
}
