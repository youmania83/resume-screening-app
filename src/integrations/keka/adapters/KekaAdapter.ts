// src/integrations/keka/adapters/KekaAdapter.ts

import { KekaJob } from "../interfaces/Job";
import { KekaCandidate } from "../interfaces/Candidate";
import { KekaApplication } from "../interfaces/Application";
import { KekaInterview } from "../interfaces/Interview";
import { KekaStage } from "../interfaces/Stage";
import { KekaOffer } from "../interfaces/Offer";
import { KekaDocument } from "../interfaces/Document";

export interface ATSAdapter {
  getJobs(): Promise<KekaJob[]>;
  getJobById(id: string): Promise<KekaJob | null>;
  
  getCandidates(): Promise<KekaCandidate[]>;
  getCandidateById(id: string): Promise<KekaCandidate | null>;
  updateCandidate(id: string, candidate: Partial<KekaCandidate>): Promise<KekaCandidate>;
  
  getApplications(): Promise<KekaApplication[]>;
  moveCandidateStage(candidateId: string, stageNameOrId: string): Promise<KekaApplication>;
  
  createInterview(interview: Omit<KekaInterview, "id">): Promise<KekaInterview>;
  updateInterview(id: string, interview: Partial<KekaInterview>): Promise<KekaInterview>;
  
  getOffers(): Promise<KekaOffer[]>;
  createOffer(offer: Omit<KekaOffer, "id">): Promise<KekaOffer>;
  
  getDocuments(candidateId: string): Promise<KekaDocument[]>;
  downloadResume(candidateId: string): Promise<Buffer>;
}
