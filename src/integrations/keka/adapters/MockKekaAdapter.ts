// src/integrations/keka/adapters/MockKekaAdapter.ts

import { ATSAdapter } from "./KekaAdapter";
import { KekaJob } from "../interfaces/Job";
import { KekaCandidate } from "../interfaces/Candidate";
import { KekaApplication } from "../interfaces/Application";
import { KekaInterview } from "../interfaces/Interview";
import { KekaOffer } from "../interfaces/Offer";
import { KekaDocument } from "../interfaces/Document";

// Stateful in-memory store for rich mocking behavior
class MockKekaDatabase {
  public jobs: KekaJob[] = [];
  public candidates: KekaCandidate[] = [];
  public applications: KekaApplication[] = [];
  public interviews: KekaInterview[] = [];
  public offers: KekaOffer[] = [];
  public documents: KekaDocument[] = [];

  constructor() {
    this.initMockData();
  }

  private initMockData() {
    // 1. Core Jobs
    this.jobs = [
      {
        id: "job-mock-se-001",
        title: "Software Engineer",
        department: "Engineering",
        location: "Hyderabad, India",
        description: "Looking for a React + Node.js full stack engineer.",
        requirements: "3+ years exp, React, Node, PostgreSQL, Next.js",
        status: "active",
        hiringManager: "Jane Doe",
        openPositions: 3,
        createdAt: new Date("2026-05-01"),
        updatedAt: new Date("2026-05-15")
      },
      {
        id: "job-mock-hrm-002",
        title: "HR Manager",
        department: "Human Resources",
        location: "Mumbai, India",
        description: "Lead recruitment, onboarding, and employee relations.",
        requirements: "5+ years HR experience, MBA preferred",
        status: "active",
        hiringManager: "John Smith",
        openPositions: 1,
        createdAt: new Date("2026-05-10"),
        updatedAt: new Date("2026-05-12")
      },
      {
        id: "job-mock-se-003",
        title: "Sales Executive",
        department: "Sales & Marketing",
        location: "Remote, India",
        description: "B2B SaaS product sales expert.",
        requirements: "2+ years outbound sales, high motivation",
        status: "active",
        hiringManager: "Sarah Connor",
        openPositions: 5,
        createdAt: new Date("2026-05-18"),
        updatedAt: new Date("2026-05-20")
      }
    ];

    // 2. Generate 20 candidates across the 3 jobs
    const names = [
      "Aarav Sharma", "Aditi Patel", "Rohan Mehta", "Pooja Gupta", "Karan Malhotra",
      "Neha Nair", "Vikram Singh", "Ananya Rao", "Siddharth Joshi", "Meera Iyer",
      "Rahul Verma", "Kriti Saxena", "Arjun Reddy", "Divya Pillai", "Amit Trivedi",
      "Sneha Kulkarni", "Varun Dhawan", "Riya Sen", "Ishaan Kapoor", "Tanvi Shah"
    ];

    const emails = names.map(n => n.toLowerCase().replace(" ", ".") + "@example.com");
    const phones = names.map((_, i) => `+91 98765 432${i.toString().padStart(2, "0")}`);
    
    // Distribute stages and AI scores to test automation logic
    // Auto-Reject: <60, HR Review: 60-75, Assessment: 75-85, Interview: 85+
    const mockScores = [
      92, 88, 78, 65, 45, // Software Engineer candidates
      86, 74, 82, 60, 50, // HR Manager candidates
      89, 77, 81, 70, 55, // Sales Executive candidates
      95, 83, 76, 68, 48  // General distribution
    ];

    const mockStages = [
      "Interview", "Interview", "Assessment", "HR Review", "Rejected",
      "Interview", "HR Review", "Assessment", "HR Review", "Rejected",
      "Interview", "Assessment", "Assessment", "HR Review", "Rejected",
      "Interview", "Assessment", "Assessment", "HR Review", "Rejected"
    ];

    for (let i = 0; i < 20; i++) {
      const isSE = i % 3 === 0;
      const isHR = i % 3 === 1;
      const jobId = isSE ? "job-mock-se-001" : (isHR ? "job-mock-hrm-002" : "job-mock-se-003");
      const candId = `cand-mock-${(i + 1).toString().padStart(3, "0")}`;
      const appId = `app-mock-${(i + 1).toString().padStart(3, "0")}`;
      const score = mockScores[i];
      const stage = mockStages[i];
      const status = score < 60 ? "rejected" : "active";

      // Candidate Profile
      this.candidates.push({
        id: candId,
        jobId,
        name: names[i],
        email: emails[i],
        phone: phones[i],
        resumeUrl: `https://rison-ai-resumes.s3.amazonaws.com/mock-resume-${candId}.pdf`,
        skills: isSE ? ["React", "Node.js", "TypeScript", "PostgreSQL"] : (isHR ? ["Talent Acquisition", "Employee Relations", "Payroll"] : ["B2B Sales", "Lead Generation", "CRM"]),
        experience: 2 + (i % 6),
        education: isSE ? "B.Tech Computer Science" : (isHR ? "MBA Human Resources" : "B.Com Marketing"),
        currentStage: stage,
        status,
        aiScore: score,
        assessmentScore: score >= 75 && score < 85 ? score + 3 : undefined,
        interviewScore: score >= 85 ? score - 2 : undefined,
        finalScore: score
      });

      // Application instance
      this.applications.push({
        id: appId,
        candidateId: candId,
        jobId,
        applicationDate: new Date(Date.now() - (i * 24 * 3600 * 1000)),
        status,
        stage,
        source: i % 2 === 0 ? "LinkedIn" : "Careers Website"
      });

      // Documents (Resume & Cover Letter)
      this.documents.push({
        id: `doc-mock-res-${i}`,
        candidateId: candId,
        title: `Resume_${names[i].replace(" ", "_")}.pdf`,
        fileUrl: `https://rison-ai-resumes.s3.amazonaws.com/mock-resume-${candId}.pdf`,
        documentType: "resume",
        uploadedAt: new Date(Date.now() - (i * 24 * 3600 * 1000))
      });
    }

    // 3. Create some mock Interviews
    this.interviews = [
      {
        id: "int-mock-001",
        candidateId: "cand-mock-001", // Aarav Sharma (92 Score - Interview stage)
        interviewer: "Jane Doe (Engineering Lead)",
        dateTime: new Date(Date.now() + 2 * 24 * 3600 * 1000), // In 2 days
        status: "scheduled"
      },
      {
        id: "int-mock-002",
        candidateId: "cand-mock-006", // Neha Nair (86 Score - Interview stage)
        interviewer: "John Smith (HR Director)",
        dateTime: new Date(Date.now() - 24 * 3600 * 1000), // Yesterday
        status: "completed",
        feedback: "Excellent leadership potential and solid experience.",
        rating: 9
      }
    ];

    // 4. Create mock offers
    this.offers = [
      {
        id: "off-mock-001",
        candidateId: "cand-mock-006",
        jobId: "job-mock-hrm-002",
        salary: "14,00,000 INR per annum",
        joiningDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        status: "draft",
        offerLetterUrl: "https://rison-ai-offers.s3.amazonaws.com/offer-cand-mock-006.pdf"
      }
    ];
  }
}

export class MockKekaAdapter implements ATSAdapter {
  private db: MockKekaDatabase;

  constructor() {
    this.db = new MockKekaDatabase();
  }

  async getJobs(): Promise<KekaJob[]> {
    return this.db.jobs;
  }

  async getJobById(id: string): Promise<KekaJob | null> {
    const job = this.db.jobs.find(j => j.id === id);
    return job || null;
  }

  async getCandidates(): Promise<KekaCandidate[]> {
    return this.db.candidates;
  }

  async getCandidateById(id: string): Promise<KekaCandidate | null> {
    const candidate = this.db.candidates.find(c => c.id === id);
    return candidate || null;
  }

  async updateCandidate(id: string, updates: Partial<KekaCandidate>): Promise<KekaCandidate> {
    const candidateIdx = this.db.candidates.findIndex(c => c.id === id);
    if (candidateIdx === -1) {
      throw new Error(`Candidate with ID ${id} not found`);
    }

    const updated = { ...this.db.candidates[candidateIdx], ...updates };
    this.db.candidates[candidateIdx] = updated;
    return updated;
  }

  async getApplications(): Promise<KekaApplication[]> {
    return this.db.applications;
  }

  async moveCandidateStage(candidateId: string, stageNameOrId: string): Promise<KekaApplication> {
    // Update candidate current stage
    let candidate = this.db.candidates.find(c => c.id === candidateId);
    if (!candidate) {
      // Dynamically seed candidate in mock database to support webhook testing
      candidate = {
        id: candidateId,
        name: "Unknown Webhook Candidate",
        email: "webhook.candidate@example.com",
        status: "active",
        currentStage: stageNameOrId
      };
      this.db.candidates.push(candidate);
    } else {
      candidate.currentStage = stageNameOrId;
    }

    // Update application stage
    let application = this.db.applications.find(a => a.candidateId === candidateId);
    if (!application) {
      application = {
        id: `app-mock-${Date.now()}`,
        candidateId,
        jobId: candidate.jobId || "job-mock-se-001",
        applicationDate: new Date(),
        status: "active",
        stage: stageNameOrId,
        source: "Keka Webhook"
      };
      this.db.applications.push(application);
    } else {
      application.stage = stageNameOrId;
    }
    
    return application;
  }

  async createInterview(interviewData: Omit<KekaInterview, "id">): Promise<KekaInterview> {
    const newInterview: KekaInterview = {
      id: `int-mock-${Date.now()}`,
      ...interviewData
    };
    this.db.interviews.push(newInterview);
    return newInterview;
  }

  async updateInterview(id: string, updates: Partial<KekaInterview>): Promise<KekaInterview> {
    const interviewIdx = this.db.interviews.findIndex(i => i.id === id);
    if (interviewIdx === -1) {
      throw new Error(`Interview with ID ${id} not found`);
    }

    const updated = { ...this.db.interviews[interviewIdx], ...updates };
    this.db.interviews[interviewIdx] = updated;
    return updated;
  }

  async getOffers(): Promise<KekaOffer[]> {
    return this.db.offers;
  }

  async createOffer(offerData: Omit<KekaOffer, "id">): Promise<KekaOffer> {
    const newOffer: KekaOffer = {
      id: `off-mock-${Date.now()}`,
      ...offerData
    };
    this.db.offers.push(newOffer);
    return newOffer;
  }

  async getDocuments(candidateId: string): Promise<KekaDocument[]> {
    return this.db.documents.filter(d => d.candidateId === candidateId);
  }

  async downloadResume(candidateId: string): Promise<Buffer> {
    // Returns a dummy PDF buffer for resume download simulation
    return Buffer.from("%PDF-1.4 Mock Resume Contents for Candidate: " + candidateId);
  }
}
