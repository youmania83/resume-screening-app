// src/types/index.ts

export interface Candidate {
  id: string;
  name: string;
  role: string;
  score: number;
  matchPercent: number;
  experienceYears: number;
  experienceMatch: string;
  recommendation: string;
  confidence: string;
  riskLevel: "Low" | "Medium" | "High";
  strengths: string[];
  weaknesses: string[];
  missingSkills: string[];
  matchedSkills: string[];
  skills?: string[];
  certifications?: string[];
  projects?: string[];
  keywords?: string[];
  riskFactors?: string[];
  status: "applied" | "shortlisted" | "interviewing" | "hold" | "rejected" | "selected" | "onboarded" | "Qualified" | "Review" | "Rejected" | string;
  education: string;
  email: string;
  phone: string;
  appliedDate: string;
  applicationSource?: "Keka HRMS" | "Careers Email" | "Careers Page" | string;
  assessmentScore?: number;
  assessmentStatus?: "pending" | "passed" | "failed" | null | string;
  interviewScheduledDate?: string | null;
  interviewFeedback?: string | null;
  kekaStatus?: string;
  assessmentToken?: string;
  assessmentCompletedAt?: string;
  finalScore?: number;
  violationCount?: number;
  activityLogs?: Array<{ date: string; message: string }>;
}

export interface StructuredJD {
  title: string;
  experience: string;
  department: string;
  location: string;
  requiredSkills: string[];
  preferredSkills: string[];
  education: string;
  responsibilities: string[];
  keywords: string[];
  screeningCriteria: string[];
}

export interface JobListItem {
  title: string;
  dept: string;
  loc: string;
  exp: string;
  candidates: number;
  status: "Active" | "Closed";
  jd: StructuredJD;
}
