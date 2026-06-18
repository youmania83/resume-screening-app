// src/integrations/keka/interfaces/Job.ts

export interface KekaJob {
  id: string;
  title: string;
  department?: string;
  location?: string;
  description: string;
  requirements?: string;
  status: string; // e.g. active, closed, draft
  hiringManager?: string;
  openPositions?: number;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  
  // Sync metadata fields
  external_id?: string;
  source_system?: string;
  sync_status?: string;
  last_synced_at?: Date | string;
}
