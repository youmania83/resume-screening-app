// src/integrations/keka/interfaces/Interview.ts

export interface KekaInterview {
  id: string;
  candidateId: string;
  interviewer: string;
  dateTime: Date | string;
  status: string; // e.g. scheduled, completed, cancelled
  feedback?: string;
  rating?: number; // Interviewer rating/score
  
  // Sync metadata fields
  external_id?: string;
  source_system?: string;
  sync_status?: string;
  last_synced_at?: Date | string;
}
