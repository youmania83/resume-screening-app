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
  private cachedToken: string | null = null;
  private tokenExpiresAt: number = 0; // Epoch milliseconds

  private checkConfig() {
    if (!kekaConfig.enabled || !kekaConfig.baseUrl || !kekaConfig.apiKey) {
      throw new Error("Keka API not configured. Please supply KEKA_BASE_URL and KEKA_API_KEY in your environment.");
    }
  }

  /**
   * Retrieves an OAuth 2.0 Access Token using Client Credentials.
   * Caches the token to avoid redundant authentication requests.
   */
  private async getAccessToken(): Promise<string> {
    this.checkConfig();

    // Check if the cached token is still valid (using a 5-minute safety margin)
    if (this.cachedToken && Date.now() < this.tokenExpiresAt - 300000) {
      return this.cachedToken;
    }

    const isSandbox = kekaConfig.baseUrl.includes("kekademo") || kekaConfig.baseUrl.includes("sandbox");
    const tokenUrl = isSandbox 
      ? "https://login.kekademo.com/connect/token" 
      : "https://login.keka.com/connect/token";

    console.log(`🔑 Fetching Keka Access Token from ${tokenUrl}`);

    const params = new URLSearchParams();
    params.append("grant_type", "kekaapi");
    params.append("scope", "kekaapi");
    params.append("client_id", kekaConfig.clientId);
    params.append("client_secret", kekaConfig.clientSecret);
    params.append("api_key", kekaConfig.apiKey);

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Keka Auth Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json() as {
      access_token: string;
      expires_in: number;
      token_type: string;
      scope: string;
    };

    if (!data.access_token) {
      throw new Error("Keka API authentication failed: No access token returned.");
    }

    this.cachedToken = data.access_token;
    // Cache duration is provided in seconds; convert to epoch ms
    this.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
    return this.cachedToken;
  }

  async getJobs(): Promise<KekaJob[]> {
    const token = await this.getAccessToken();
    const url = `${kekaConfig.baseUrl}/v1/hire/jobs`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Keka API - getJobs failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json() as any;
    const rawJobs = (result.data || []) as any[];
    return rawJobs.map((job: any) => ({
      id: job.id,
      title: job.title,
      description: job.description || "",
      department: job.departmentName || undefined,
      location: job.jobLocations?.[0]?.name || undefined,
      requirements: job.experience || undefined,
      status: job.status === 0 ? "active" : "closed",
      hiringManager: job.hiringTeam?.find((m: any) => m.type === 0)?.displayName || undefined,
      openPositions: job.noOfOpenings ? parseInt(job.noOfOpenings, 10) : undefined,
      createdAt: job.createdOn ? new Date(job.createdOn) : undefined,
      updatedAt: job.publishedOn ? new Date(job.publishedOn) : undefined,
      external_id: job.id,
      source_system: "Keka",
      sync_status: "synced",
      last_synced_at: new Date()
    }));
  }

  async getJobById(id: string): Promise<KekaJob | null> {
    // Fallback: Keka doesn't list an explicit single job fetch, list and filter.
    const jobs = await this.getJobs();
    return jobs.find(job => job.id === id) || null;
  }

  async getCandidates(): Promise<KekaCandidate[]> {
    // Candidates are nested under jobs in the Keka Hire API.
    // Fetch all active jobs, then gather/flatten candidates.
    const jobs = await this.getJobs();
    const allCandidates: KekaCandidate[] = [];

    for (const job of jobs) {
      try {
        const candidates = await this.getCandidatesForJob(job.id);
        allCandidates.push(...candidates);
      } catch (err) {
        console.error(`Failed to fetch candidates for job ${job.id}:`, err);
      }
    }

    return allCandidates;
  }

  async getCandidatesForJob(jobId: string): Promise<KekaCandidate[]> {
    const token = await this.getAccessToken();
    const url = `${kekaConfig.baseUrl}/v1/hire/jobs/${jobId}/candidates`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Keka API - getCandidatesForJob failed for ${jobId}: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json() as any;
    const rawCandidates = (result.data || []) as any[];
    return rawCandidates.map((cand: any) => ({
      id: cand.id,
      jobId: jobId,
      name: `${cand.firstName || ""} ${cand.middleName || ""} ${cand.lastName || ""}`.replace(/\s+/g, " ").trim(),
      email: cand.email,
      phone: cand.phone || undefined,
      resumeUrl: undefined, // Filled on-demand
      skills: cand.skills || [],
      experience: cand.experienceDetails?.length || undefined,
      education: cand.educationDetails?.[0]?.degree || undefined,
      currentStage: cand.jobApplicationDetails?.jobHiringStageId || undefined,
      status: cand.jobApplicationDetails?.status === 0 ? "active" : "inactive",
      external_id: cand.id,
      source_system: "Keka",
      sync_status: "synced",
      last_synced_at: new Date()
    }));
  }

  async getCandidateById(id: string): Promise<KekaCandidate | null> {
    const candidates = await this.getCandidates();
    return candidates.find(c => c.id === id) || null;
  }

  async updateCandidate(id: string, candidate: Partial<KekaCandidate>): Promise<KekaCandidate> {
    const token = await this.getAccessToken();

    let jobId = candidate.jobId;
    if (!jobId) {
      const existing = await this.getCandidateById(id);
      if (!existing || !existing.jobId) {
        throw new Error(`Cannot update candidate ${id}: Job ID not found.`);
      }
      jobId = existing.jobId;
    }

    const url = `${kekaConfig.baseUrl}/v1/hire/jobs/${jobId}/candidate/${id}`;

    // Construct standard JSON Patch operations
    const patchOperations: any[] = [];
    if (candidate.name) {
      const parts = candidate.name.split(" ");
      patchOperations.push({ op: "replace", path: "/firstName", value: parts[0] });
      if (parts.length > 1) {
        patchOperations.push({ op: "replace", path: "/lastName", value: parts.slice(1).join(" ") });
      }
    }
    if (candidate.email) {
      patchOperations.push({ op: "replace", path: "/email", value: candidate.email });
    }
    if (candidate.phone) {
      patchOperations.push({ op: "replace", path: "/phone", value: ["91", candidate.phone.replace(/\D/g, "")] });
    }

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json-patch+json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(patchOperations)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Keka API - updateCandidate failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const updated = await this.getCandidateById(id);
    if (!updated) {
      throw new Error("Updated candidate, but failed to retrieve fresh instance.");
    }
    return updated;
  }

  async getApplications(): Promise<KekaApplication[]> {
    // Return empty array / stub for applications
    return [];
  }

  async moveCandidateStage(candidateId: string, stageNameOrId: string): Promise<KekaApplication> {
    // Stub
    throw new Error("moveCandidateStage endpoint not yet fully configured.");
  }

  async createInterview(interview: Omit<KekaInterview, "id">): Promise<KekaInterview> {
    // Stub
    throw new Error("createInterview endpoint not yet fully configured.");
  }

  async updateInterview(id: string, interview: Partial<KekaInterview>): Promise<KekaInterview> {
    // Stub
    throw new Error("updateInterview endpoint not yet fully configured.");
  }

  async getOffers(): Promise<KekaOffer[]> {
    return [];
  }

  async createOffer(offer: Omit<KekaOffer, "id">): Promise<KekaOffer> {
    throw new Error("createOffer endpoint not yet fully configured.");
  }

  async getDocuments(candidateId: string): Promise<KekaDocument[]> {
    const token = await this.getAccessToken();
    const url = `${kekaConfig.baseUrl}/v1/hire/jobs/candidate/${candidateId}/resume`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });
      if (response.ok) {
        const result = await response.json() as any;
        const fileUrl = result.data?.fileUrl;
        if (fileUrl) {
          return [{
            id: `resume-${candidateId}`,
            candidateId,
            title: "resume.pdf",
            fileUrl: fileUrl,
            documentType: "Resume",
            uploadedAt: new Date()
          }];
        }
      }
    } catch (e) {
      console.error(`Failed to fetch documents for candidate ${candidateId}:`, e);
    }
    return [];
  }

  async downloadResume(candidateId: string): Promise<Buffer> {
    const token = await this.getAccessToken();
    const url = `${kekaConfig.baseUrl}/v1/hire/jobs/candidate/${candidateId}/resume`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Keka API - Fetch resume URL failed for candidate ${candidateId}: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json() as any;
    const fileUrl = result.data?.fileUrl;
    if (!fileUrl) {
      throw new Error(`Keka API - No resume file URL returned for candidate ${candidateId}`);
    }

    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      throw new Error(`Keka API - Failed to download file from resume URL: ${fileResponse.status} ${fileResponse.statusText}`);
    }

    const arrayBuffer = await fileResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
