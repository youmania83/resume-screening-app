// src/integrations/keka/interfaces/Stage.ts

export interface KekaStage {
  id: string;
  name: string;
  description?: string;
  order_index: number;
  
  // Sync metadata fields
  external_id?: string;
  source_system?: string;
  sync_status?: string;
  last_synced_at?: Date | string;
}
