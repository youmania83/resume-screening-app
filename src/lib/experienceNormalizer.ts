// src/lib/experienceNormalizer.ts

export interface ExperienceReconciliationInput {
  experienceYears?: number | string;
  recommendation?: string;
  strengths?: string[];
  experienceMatch?: string;
  weaknesses?: string[];
  skills?: string[];
  role?: string;
}

export interface ExperienceReconciliationOutput {
  experienceYears: number;
  recommendation: string;
  strengths: string[];
  experienceMatch: string;
}

/**
 * Extracts candidate total experience numbers mentioned in narrative text
 * (e.g. "8+ years of experience", "Over 10 years of hands-on experience", "10+ years")
 */
export function extractExperienceYearsFromText(text: string): number | null {
  if (!text || typeof text !== "string") return null;

  // Patterns matching "10+ years", "8+ years", "Over 10 years", "10+ years of", "has 8 years of"
  const patterns = [
    /(?:over|around|more than|approx(?:imately)?)\s*(\d+(?:\.\d+)?)\s*\+?\s*years?/i,
    /(\d+(?:\.\d+)?)\s*\+\s*years?/i,
    /(\d+(?:\.\d+)?)\s*years?\s*of\s*(?:professional|extensive|hands-on|relevant|industry|work|graphic|engineering|fabrication|design|technical)?\s*experience/i,
    /has\s*(\d+(?:\.\d+)?)\s*\+?\s*years?/i,
    /documented\s*(\d+(?:\.\d+)?)\s*\+?\s*years?/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const parsed = parseFloat(match[1]);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 50) {
        return parsed;
      }
    }
  }

  return null;
}

/**
 * Reconciles numeric experience_years with AI narrative text (strengths, recommendation, experienceMatch)
 * to ensure 100% consistency across Table and Modal views.
 */
export function reconcileExperienceData(data: ExperienceReconciliationInput): ExperienceReconciliationOutput {
  let expYears = typeof data.experienceYears === "number"
    ? data.experienceYears
    : parseFloat(String(data.experienceYears || 0)) || 0;

  // Collect text samples to inspect explicit domain experience claims
  const textSamples: string[] = [];
  if (data.recommendation) textSamples.push(data.recommendation);
  if (data.experienceMatch) textSamples.push(data.experienceMatch);
  if (Array.isArray(data.strengths)) textSamples.push(...data.strengths);

  let highestTextExp: number | null = null;
  for (const sample of textSamples) {
    const extracted = extractExperienceYearsFromText(sample);
    if (extracted !== null) {
      if (highestTextExp === null || extracted > highestTextExp) {
        highestTextExp = extracted;
      }
    }
  }

  // If narrative explicitly identifies higher domain experience (e.g. 8+ or 10+ years)
  // while numeric parser was lower (e.g. 6 or 1), elevate experienceYears to match domain narrative.
  if (highestTextExp !== null && highestTextExp > expYears) {
    console.log(`⚡ [Experience Normalizer] Elevating parsed experienceYears (${expYears} -> ${highestTextExp}) based on AI domain narrative.`);
    expYears = highestTextExp;
  }

  // Ensure experienceMatch text uses consistent figure
  let experienceMatch = data.experienceMatch || "";
  if (!experienceMatch.trim()) {
    experienceMatch = `${expYears}+ year(s) of experience recorded against the ${data.role || "applied role"} requirement.`;
  } else {
    // If experienceMatch contains a conflicting year number (e.g., "1.0 Years" when expYears is 10), update it
    experienceMatch = experienceMatch.replace(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/gi, (fullMatch, numStr) => {
      const num = parseFloat(numStr);
      if (num !== expYears && num < expYears) {
        return `${expYears}+ years`;
      }
      return fullMatch;
    });
  }

  // Reconcile strengths array if items have conflicting numbers
  const strengths = (Array.isArray(data.strengths) ? [...data.strengths] : []).map(str => {
    if (typeof str !== "string") return str;
    return str.replace(/(\d+(?:\.\d+)?)\s*\+\s*years?/gi, (fullMatch, numStr) => {
      const num = parseFloat(numStr);
      if (num < expYears) {
        return `${expYears}+ years`;
      }
      return fullMatch;
    });
  });

  return {
    experienceYears: expYears,
    recommendation: data.recommendation || "",
    strengths,
    experienceMatch
  };
}
