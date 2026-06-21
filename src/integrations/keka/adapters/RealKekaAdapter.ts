// src/integrations/keka/adapters/RealKekaAdapter.ts

import { ATSAdapter } from "./KekaAdapter";
import { KekaJob } from "../interfaces/Job";
import { KekaCandidate } from "../interfaces/Candidate";
import { KekaApplication } from "../interfaces/Application";
import { KekaInterview } from "../interfaces/Interview";
import { KekaOffer } from "../interfaces/Offer";
import { KekaDocument } from "../interfaces/Document";
import { kekaConfig } from "../config/keka.config";

export class RealKekaAdapter implements ATSAdapter {
  private checkConfig() {
    if (!kekaConfig.enabled || !kekaConfig.baseUrl || !kekaConfig.apiKey) {
      throw new Error("Keka API not configured. Please supply KEKA_BASE_URL and KEKA_API_KEY in your environment.");
    }
  }

  async getJobs(): Promise<KekaJob[]> {
    this.checkConfig();
    // TODO: Implement GET /api/v1/keka/jobs
    throw new Error("Keka API - getJobs endpoint mapping pending documentation/keys.");
  }

  async getJobById(_id: string): Promise<KekaJob | null> {
    this.checkConfig();
    // TODO: Implement GET /api/v1/keka/jobs/{id}
    throw new Error("Keka API - getJobById endpoint mapping pending documentation/keys.");
  }

  async getCandidates(): Promise<KekaCandidate[]> {
    this.checkConfig();
    // TODO: Implement GET /api/v1/keka/candidates
    throw new Error("Keka API - getCandidates endpoint mapping pending documentation/keys.");
  }

  async getCandidateById(_id: string): Promise<KekaCandidate | null> {
    this.checkConfig();
    // TODO: Implement GET /api/v1/keka/candidates/{id}
    throw new Error("Keka API - getCandidateById endpoint mapping pending documentation/keys.");
  }

  async updateCandidate(_id: string, _candidate: Partial<KekaCandidate>): Promise<KekaCandidate> {
    this.checkConfig();
    // TODO: Implement PATCH/PUT /api/v1/keka/candidates/{id}
    throw new Error("Keka API - updateCandidate endpoint mapping pending documentation/keys.");
  }

  async getApplications(): Promise<KekaApplication[]> {
    this.checkConfig();
    // TODO: Implement GET /api/v1/keka/applications
    throw new Error("Keka API - getApplications endpoint mapping pending documentation/keys.");
  }

  async moveCandidateStage(_candidateId: string, _stageNameOrId: string): Promise<KekaApplication> {
    this.checkConfig();
    // TODO: Implement POST /api/v1/keka/candidates/{candidateId}/stages
    throw new Error("Keka API - moveCandidateStage endpoint mapping pending documentation/keys.");
  }

  async createInterview(_interview: Omit<KekaInterview, "id">): Promise<KekaInterview> {
    this.checkConfig();
    // TODO: Implement POST /api/v1/keka/interviews
    throw new Error("Keka API - createInterview endpoint mapping pending documentation/keys.");
  }

  async updateInterview(_id: string, _interview: Partial<KekaInterview>): Promise<KekaInterview> {
    this.checkConfig();
    // TODO: Implement PATCH /api/v1/keka/interviews/{id}
    throw new Error("Keka API - updateInterview endpoint mapping pending documentation/keys.");
  }

  async getOffers(): Promise<KekaOffer[]> {
    this.checkConfig();
    // TODO: Implement GET /api/v1/keka/offers
    throw new Error("Keka API - getOffers endpoint mapping pending documentation/keys.");
  }

  async createOffer(_offer: Omit<KekaOffer, "id">): Promise<KekaOffer> {
    this.checkConfig();
    // TODO: Implement POST /api/v1/keka/offers
    throw new Error("Keka API - createOffer endpoint mapping pending documentation/keys.");
  }

  async getDocuments(_candidateId: string): Promise<KekaDocument[]> {
    this.checkConfig();
    // TODO: Implement GET /api/v1/keka/candidates/{candidateId}/documents
    throw new Error("Keka API - getDocuments endpoint mapping pending documentation/keys.");
  }

  async downloadResume(_candidateId: string): Promise<Buffer> {
    this.checkConfig();
    // TODO: Implement GET /api/v1/keka/candidates/{candidateId}/resume/download
    throw new Error("Keka API - downloadResume endpoint mapping pending documentation/keys.");
  }
}
