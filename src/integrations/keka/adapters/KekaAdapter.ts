// src/integrations/keka/adapters/KekaAdapter.ts

import { KekaJob } from "../interfaces/Job.js";
import { KekaCandidate } from "../interfaces/Candidate.js";
import { KekaApplication } from "../interfaces/Application.js";
import { KekaInterview } from "../interfaces/Interview.js";
import { KekaOffer } from "../interfaces/Offer.js";
import { KekaDocument } from "../interfaces/Document.js";

export interface ATSAdapter {
  getJobs(): Promise<KekaJob[]>;
  getJobById(id: string): Promise<KekaJob | null>;
  
  getCandidates(): Promise<KekaCandidate[]>;
  getCandidatesForJob(jobId: string, jobTitle?: string): Promise<KekaCandidate[]>;
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
