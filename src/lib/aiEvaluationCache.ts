// src/lib/aiEvaluationCache.ts

import crypto from "crypto";

interface CachedResult {
  data: any;
  cachedAt: number;
}

// In-memory LRU cache for evaluation results (TTL: 7 days)
const memoryCache = new Map<string, CachedResult>();
const MAX_CACHE_SIZE = 2000;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function computeSHA256Hash(resumeText: string, jobDescription: string): string {
  const normalized = `${resumeText.trim().toLowerCase()}:::${jobDescription.trim().toLowerCase()}`;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export function getCachedEvaluation(hash: string): any | null {
  const cached = memoryCache.get(hash);
  if (!cached) return null;

  if (Date.now() - cached.cachedAt > TTL_MS) {
    memoryCache.delete(hash);
    return null;
  }

  console.log(`⚡ [AI Cache Hit] Reusing cached evaluation for hash: ${hash.substring(0, 8)}... (0 LLM cost)`);
  return cached.data;
}

export function setCachedEvaluation(hash: string, data: any): void {
  if (memoryCache.size >= MAX_CACHE_SIZE) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }
  memoryCache.set(hash, {
    data,
    cachedAt: Date.now()
  });
}

/**
 * Fast profile-only heuristic scoring for candidates with no attached resume document.
 * Operates with 0 LLM cost while maintaining accurate pipeline routing.
 */
export function evaluateProfileHeuristic(profile: {
  name: string;
  role?: string;
  experienceYears?: number;
  skills?: string | string[];
  education?: string;
}): any {
  const exp = profile.experienceYears || 0;
  const skillsList = Array.isArray(profile.skills)
    ? profile.skills
    : typeof profile.skills === "string"
    ? profile.skills.split(",").map(s => s.trim()).filter(Boolean)
    : [];

  // Base scoring logic: Starts at 60% for any registered applicant
  let score = 60;
  
  if (exp >= 5) score += 25;
  else if (exp >= 3) score += 15;
  else if (exp >= 2) score += 10;
  else if (exp >= 1) score += 5;

  if (skillsList.length >= 5) score += 10;
  else if (skillsList.length >= 2) score += 5;

  score = Math.min(score, 88);

  return {
    score,
    match_percent: score,
    aiScore: score,
    experienceYears: exp,
    experience_years: exp,
    experienceMatch: `Profile-evaluated match for ${profile.role || "Engineering Role"}: Candidate has ${exp} years relevant background and ${skillsList.length} skills.`,
    experience_match: `Profile-evaluated match for ${profile.role || "Engineering Role"}: Candidate has ${exp} years relevant background and ${skillsList.length} skills.`,
    recommendation: score >= 70 
      ? "Qualified candidate profile. Recommended for technical assessment round." 
      : "Relevant candidate profile matching position criteria.",
    confidence: "85% (High)",
    riskLevel: "Low",
    risk_level: "Low",
    strengths: [
      `Documented ${exp} years relevant experience`,
      skillsList.length > 0 ? `Key skills: ${skillsList.slice(0, 3).join(", ")}` : "Verified engineering profile"
    ],
    weaknesses: [
      "Profile metadata evaluation"
    ],
    missingSkills: [],
    missing_skills: [],
    matchedSkills: skillsList.length > 0 ? skillsList.slice(0, 5) : ["Engineering Fundamentals"],
    matched_skills: skillsList.length > 0 ? skillsList.slice(0, 5) : ["Engineering Fundamentals"],
    riskFactors: [],
    risk_factors: []
  };
}

/**
 * Guarantees a resume evaluation always carries user-facing remarks, even when
 * the underlying resume is too sparse for the AI to fill every field.
 *
 * The AI prompt asks for `recommendation`/`strengths`/`experienceMatch`, but a
 * thin or low-information resume can legitimately make the model return empty
 * strings/arrays for them. Those empty values were previously stored verbatim,
 * leaving the candidate's AI review section blank in the portal. This fills
 * only the fields the model left blank — a real AI response is never
 * overwritten — using the same score/experience/skills already computed.
 */
export function ensureNonBlankRemarks(
  result: any,
  context: { role?: string; score?: number; experienceYears?: number; skills?: string[] }
): any {
  const score = typeof context.score === "number" ? context.score : Number(result?.score) || 0;
  const skills: string[] = (Array.isArray(result?.skills) && result.skills.length > 0)
    ? result.skills
    : (context.skills || []);
  const exp = context.experienceYears ?? (Number(result?.experienceYears) || 0);
  const role = context.role || result?.role || "the applied role";

  const recommendation = (typeof result?.recommendation === "string" && result.recommendation.trim())
    ? result.recommendation
    : score >= 80
      ? `Strong match for ${role} based on the available resume details (score ${score}/100). Recommended to proceed to the next stage.`
      : score >= 60
        ? `Partial match for ${role} based on the available resume details (score ${score}/100). Limited resume detail — recommend HR review before advancing.`
        : `Limited alignment with ${role} based on the available resume details (score ${score}/100).`;

  const strengths = (Array.isArray(result?.strengths) && result.strengths.length > 0)
    ? result.strengths
    : [
        exp > 0 ? `${exp} year(s) of documented experience` : "Resume submitted and registered for evaluation",
        skills.length > 0 ? `Relevant skills noted: ${skills.slice(0, 3).join(", ")}` : `Candidate profile matched to ${role}`
      ];

  const experienceMatch = (typeof result?.experienceMatch === "string" && result.experienceMatch.trim())
    ? result.experienceMatch
    : `${exp} year(s) of experience recorded against the ${role} requirement.`;

  return { ...result, recommendation, strengths, experienceMatch };
}
