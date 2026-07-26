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

  // Base scoring logic for profile-only candidates
  let score = 50;
  
  if (exp >= 5) score += 25;
  else if (exp >= 2) score += 15;
  else if (exp >= 1) score += 10;

  if (skillsList.length >= 5) score += 15;
  else if (skillsList.length >= 2) score += 10;

  score = Math.min(score, 75); // Cap profile-only scores at 75% to encourage resume attachment for top tier

  return {
    score,
    match_percent: score,
    experience_years: exp,
    experience_match: `Profile-only evaluation: Candidate lists ${exp} years experience and ${skillsList.length} documented skills.`,
    recommendation: score >= 65 
      ? "Suitable profile candidate. Request full resume document for technical round." 
      : "Basic profile information provided. Recommend detailed resume upload.",
    confidence: "70% (Medium - No Resume File)",
    risk_level: "Medium",
    strengths: [
      `Documented ${exp} years relevant experience`,
      skillsList.length > 0 ? `Listed key skills: ${skillsList.slice(0, 3).join(", ")}` : "Registered candidate profile"
    ],
    weaknesses: [
      "No detailed resume document attached in ATS application",
      "Scored based on profile metadata only"
    ],
    missing_skills: [],
    matched_skills: skillsList.slice(0, 5),
    risk_factors: ["Verification needed: Resume file was not provided during ingestion."]
  };
}
