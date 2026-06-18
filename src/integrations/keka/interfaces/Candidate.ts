// src/integrations/keka/interfaces/Candidate.ts

export interface KekaCandidate {
  id: string;
  jobId?: string;
  name: string;
  email: string;
  phone?: string;
  resumeUrl?: string;
  skills?: string[];
  experience?: number; // years of experience
  education?: string;
  currentStage?: string; // e.g. Applied, HR Review, Assessment, Interview, Hired, Rejected
  status: string; // e.g. active, rejected, hired
  aiScore?: number;
  assessmentScore?: number;
  interviewScore?: number;
  finalScore?: number;
  
  // Sync metadata fields
  external_id?: string;
  source_system?: string;
  sync_status?: string;
  last_synced_at?: Date | string;
}
