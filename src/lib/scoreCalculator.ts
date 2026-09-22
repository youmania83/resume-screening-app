// src/lib/scoreCalculator.ts
import { getRoleFamilyScore, classifyRoleFamily, ROLE_COMPAT_SHORTLIST_THRESHOLD } from "./roleCompatibility.js";

export interface ScoreCalculationInput {
  candidateExperienceYears: number;
  requiredExperienceText?: string;
  candidateSkills?: string[];
  jobRequiredSkills?: string[];
  candidateRole?: string;
  jobTitle?: string;
  baseAiScore?: number;
  rawResumeText?: string;
  candidateEducation?: string;
  jobDescriptionText?: string;
}

export interface DetailedScoreResult {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  isEligible: boolean;
  ineligibilityReasons: string[];
  isDataSufficient: boolean;
  subScores: {
    skills: number;
    experience: number;
    role: number;
    education: number;
    completeness: number;
  };
}

// List of generic filler/soft skills that must not be counted as technical domain competencies
const GENERIC_SOFT_SKILLS = new Set([
  "communication",
  "good communication",
  "good communication skills",
  "excellent communication",
  "teamwork",
  "team work",
  "team player",
  "team collaboration",
  "collaboration",
  "problem solving",
  "quick learner",
  "fast learner",
  "hardworking",
  "punctual",
  "adaptability",
  "ability to adapt",
  "ms office",
  "ms word",
  "ms excel",
  "microsoft office",
  "powerpoint",
  "basic computer",
  "internet surfing",
  "interpersonal skills",
  "willingness to learn",
  "positive attitude"
]);

/**
 * Parses minimum required experience years from job text or required experience string.
 */
export function parseRequiredExperience(expText?: string, jdText?: string): number {
  const textToScan = `${expText || ""} ${jdText || ""}`.toLowerCase();
  if (!textToScan.trim()) return 0;

  // Patterns like "minimum 5 years", "min 5 yrs", "5+ years", "5 - 7 years", "15 years"
  const minMatch = textToScan.match(/(?:minimum|min|at least)\s*(\d+)(?:\s*(?:years|year|yrs|y))?/i);
  if (minMatch && minMatch[1]) {
    return parseInt(minMatch[1], 10);
  }

  const rangeMatch = textToScan.match(/(\d+)\s*[-–to]+\s*(\d+)\s*(?:years|year|yrs|y)/i);
  if (rangeMatch && rangeMatch[1]) {
    return parseInt(rangeMatch[1], 10);
  }

  const plusMatch = textToScan.match(/(\d+)\s*\+\s*(?:years|year|yrs|y)/i);
  if (plusMatch && plusMatch[1]) {
    return parseInt(plusMatch[1], 10);
  }

  const simpleMatch = textToScan.match(/experience\s*:\s*(\d+)/i) || textToScan.match(/(\d+)\s*(?:years|year|yrs|y)\s*(?:of)?\s*experience/i);
  if (simpleMatch && simpleMatch[1]) {
    return parseInt(simpleMatch[1], 10);
  }

  if (textToScan.includes("get") || textToScan.includes("trainee") || textToScan.includes("fresher")) {
    return 0;
  }

  return 0;
}

/**
 * Assesses whether a resume has sufficient information density to be evaluated fairly.
 */
export function checkInformationSufficiency(
  candidateSkills: string[] = [],
  candidateExperienceYears: number = 0,
  candidateEducation: string = "",
  rawResumeText: string = ""
): { isSufficient: boolean; completenessScore: number; reason?: string } {
  const technicalSkills = candidateSkills.filter(s => !GENERIC_SOFT_SKILLS.has(s.toLowerCase().trim()));
  const wordCount = rawResumeText ? rawResumeText.trim().split(/\s+/).length : (candidateSkills.length * 5 + 50);

  // Severe insufficiency check
  if (wordCount < 40 && technicalSkills.length < 2) {
    return {
      isSufficient: false,
      completenessScore: 20,
      reason: "Resume text is too sparse (< 40 words) with fewer than 2 verifiable skills."
    };
  }

  if (technicalSkills.length === 0 && !candidateEducation && candidateExperienceYears === 0) {
    return {
      isSufficient: false,
      completenessScore: 25,
      reason: "No technical skills, no education, and no documented experience."
    };
  }

  let completeness = 50;
  if (technicalSkills.length >= 3) completeness += 20;
  if (candidateEducation && candidateEducation.trim().length > 3) completeness += 15;
  if (candidateExperienceYears > 0 || rawResumeText.toLowerCase().includes("project") || rawResumeText.toLowerCase().includes("b.e") || rawResumeText.toLowerCase().includes("b.tech")) completeness += 15;

  return {
    isSufficient: completeness >= 65,
    completenessScore: completeness,
    reason: completeness < 65 ? "Profile lacks sufficient technical depth or structural completeness." : undefined
  };
}

/**
 * Evaluates candidate detailed score and eligibility against a job requisition.
 */
export function evaluateCandidateDetailedScore(input: ScoreCalculationInput): DetailedScoreResult {
  const {
    candidateExperienceYears = 0,
    requiredExperienceText,
    candidateSkills = [],
    jobRequiredSkills = [],
    candidateRole = "",
    jobTitle = "",
    baseAiScore,
    rawResumeText = "",
    candidateEducation = "",
    jobDescriptionText = ""
  } = input;

  const ineligibilityReasons: string[] = [];

  // 1. Information Sufficiency Gate
  const sufficiency = checkInformationSufficiency(
    candidateSkills,
    candidateExperienceYears,
    candidateEducation,
    rawResumeText
  );

  if (!sufficiency.isSufficient) {
    ineligibilityReasons.push(`Insufficient Information: ${sufficiency.reason}`);
  }

  // 2. Parse Required Experience
  const requiredYears = parseRequiredExperience(requiredExperienceText, jobDescriptionText);

  // 3. Compute Experience Sub-Score
  let expScore = 70;
  if (requiredYears === 0) {
    // Fresher / GET / Trainee role
    expScore = candidateExperienceYears <= 2 ? 100 : 75; // Slight over-qualification deduction for senior applying to GET
  } else if (candidateExperienceYears >= requiredYears) {
    expScore = 100;
  } else {
    // Candidate has less experience than required
    const expGap = requiredYears - candidateExperienceYears;
    if (expGap > 2 || (requiredYears >= 5 && candidateExperienceYears < 3)) {
      // Severe experience gap (e.g. 1.5 yrs vs 5 yrs required)
      expScore = Math.max(10, Math.round((candidateExperienceYears / requiredYears) * 35));
      ineligibilityReasons.push(
        `Experience Deficit: Candidate has ${candidateExperienceYears} yrs experience, but job strictly requires minimum ${requiredYears} yrs.`
      );
    } else {
      // Moderate gap (e.g. 4 yrs vs 5 yrs)
      expScore = Math.max(30, Math.round((candidateExperienceYears / requiredYears) * 75));
    }
  }

  // 4. Compute Technical Skills Fit Sub-Score
  // Filter out filler soft skills from candidate list
  const validCandidateSkills = candidateSkills.filter(s => s && s.trim().length > 1);
  const technicalCandidateSkills = validCandidateSkills.filter(s => !GENERIC_SOFT_SKILLS.has(s.toLowerCase().trim()));

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  const jdFullText = `${jobTitle} ${jobDescriptionText} ${(jobRequiredSkills || []).join(" ")}`.toLowerCase();

  // Match candidate skills against JD text or required skills
  for (const s of validCandidateSkills) {
    const sLower = s.toLowerCase().trim();
    if (!sLower) continue;

    let isMatch = false;
    if (jobRequiredSkills && jobRequiredSkills.length > 0) {
      isMatch = jobRequiredSkills.some(js => {
        const jsLower = js.toLowerCase().trim();
        return jsLower === sLower || jsLower.includes(sLower) || sLower.includes(jsLower);
      });
    } else {
      // Match whole word/phrase in JD to avoid loose 3-letter token false-positives
      const wordBoundary = new RegExp(`\\b${sLower.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
      isMatch = wordBoundary.test(jdFullText);
    }

    if (isMatch) {
      matchedSkills.push(s);
    } else {
      missingSkills.push(s);
    }
  }

  // Calculate technical skill match ratio
  let skillsScore = 40;
  if (jobRequiredSkills && jobRequiredSkills.length > 0) {
    const requiredMatches = jobRequiredSkills.filter(js => {
      const jsLower = js.toLowerCase();
      return technicalCandidateSkills.some(cs => cs.toLowerCase().includes(jsLower) || jsLower.includes(cs.toLowerCase()));
    }).length;
    skillsScore = Math.min(100, Math.round((requiredMatches / Math.max(2, jobRequiredSkills.length)) * 100));
  } else {
    // If no explicit JD skills array, evaluate based on technical skills matched vs standard expected threshold (e.g. 5)
    const techMatchedCount = matchedSkills.filter(s => !GENERIC_SOFT_SKILLS.has(s.toLowerCase().trim())).length;
    if (techMatchedCount >= 6) skillsScore = 95;
    else if (techMatchedCount >= 4) skillsScore = 80;
    else if (techMatchedCount >= 2) skillsScore = 60;
    else if (techMatchedCount === 1) skillsScore = 40;
    else skillsScore = 20;
  }

  // 5. Role Alignment & Role Family Sub-Score
  let roleScore = 35;
  const familyCompatScore = getRoleFamilyScore(candidateRole, jobTitle);
  if (candidateRole && jobTitle) {
    const cRoleLower = candidateRole.toLowerCase().trim();
    const jTitleLower = jobTitle.toLowerCase().trim();
    if (cRoleLower === jTitleLower || cRoleLower.includes(jTitleLower) || jTitleLower.includes(cRoleLower)) {
      roleScore = 100;
    } else {
      roleScore = familyCompatScore;
    }
  }

  if (familyCompatScore < ROLE_COMPAT_SHORTLIST_THRESHOLD) {
    ineligibilityReasons.push(
      `Role Domain Mismatch: Inferred role "${candidateRole}" is incompatible with target opening "${jobTitle}" (compatibility ${familyCompatScore}% < ${ROLE_COMPAT_SHORTLIST_THRESHOLD}%).`
    );
  }

  // 6. Education Sub-Score & Domain Check
  let educationScore = 60;
  const eduLower = (candidateEducation || "").toLowerCase();
  const titleLower = jobTitle.toLowerCase();

  const isCivilJob = titleLower.includes("civil");
  const isMechJob = titleLower.includes("mechanical") || titleLower.includes("get") || titleLower.includes("fabrication") || titleLower.includes("piping");
  const isElectricalJob = titleLower.includes("electrical");
  const isSCMJob = titleLower.includes("scm") || titleLower.includes("supply chain") || titleLower.includes("logistics");

  if (candidateEducation) {
    if (isCivilJob) {
      if (eduLower.includes("civil")) educationScore = 100;
      else if (eduLower.includes("mechanical") || eduLower.includes("electrical")) educationScore = 50;
      else educationScore = 30;
    } else if (isMechJob) {
      if (eduLower.includes("mechanical") || eduLower.includes("automobile") || eduLower.includes("production")) educationScore = 100;
      else if (eduLower.includes("electronics") || eduLower.includes("electrical")) educationScore = 55;
      else educationScore = 30;
    } else if (isElectricalJob) {
      if (eduLower.includes("electrical") || eduLower.includes("eee") || eduLower.includes("electronics")) educationScore = 100;
      else educationScore = 40;
    } else if (isSCMJob) {
      if (eduLower.includes("mba") || eduLower.includes("supply chain") || eduLower.includes("logistics") || eduLower.includes("b.com") || eduLower.includes("engineering")) educationScore = 90;
      else educationScore = 60;
    } else {
      educationScore = 75;
    }
  }

  // 7. Weighted Composite Score
  // Weights:
  // - Role Alignment:       25%
  // - Skills Fit:           30%
  // - Experience Fit:       25%
  // - Education Fit:        10%
  // - Completeness Gate:    10%
  let rawScore = Math.round(
    roleScore * 0.25 +
    skillsScore * 0.30 +
    expScore * 0.25 +
    educationScore * 0.10 +
    sufficiency.completenessScore * 0.10
  );

  if (typeof baseAiScore === "number" && baseAiScore > 0) {
    // Blend with base AI score if provided, but anchor heavily to factual subscores
    rawScore = Math.round(baseAiScore * 0.25 + rawScore * 0.75);
  }

  // 8. Strict Guardrail Caps
  // Incompatible role family -> Hard cap at 39 (cannot reach 50% match floor or 80% shortlist)
  if (familyCompatScore < ROLE_COMPAT_SHORTLIST_THRESHOLD) {
    rawScore = Math.min(rawScore, 39);
  }

  // Insufficient information -> Hard cap at 45
  if (!sufficiency.isSufficient) {
    rawScore = Math.min(rawScore, 45);
  }

  // Severe experience deficit for senior/mid roles -> Hard cap at 58
  if (requiredYears >= 4 && candidateExperienceYears < (requiredYears - 2)) {
    rawScore = Math.min(rawScore, 58);
  }

  const finalScore = Math.min(100, Math.max(10, rawScore));
  const isEligible = ineligibilityReasons.length === 0 && finalScore >= 80;

  return {
    score: finalScore,
    matchedSkills,
    missingSkills: missingSkills.slice(0, 5),
    isEligible,
    ineligibilityReasons,
    isDataSufficient: sufficiency.isSufficient,
    subScores: {
      skills: skillsScore,
      experience: expScore,
      role: roleScore,
      education: educationScore,
      completeness: sufficiency.completenessScore
    }
  };
}

/**
 * Drop-in backward compatible wrapper for calculatePrecisionCandidateScore.
 */
export function calculatePrecisionCandidateScore(input: ScoreCalculationInput): number {
  return evaluateCandidateDetailedScore(input).score;
}

/**
 * Gatekeeper for shortlisting and automated assessment invitation.
 * Returns true ONLY if candidate has complete data, meets eligibility, and has no domain mismatch.
 */
export function isCandidateEligibleForShortlisting(
  candidate: {
    score: number;
    experienceYears?: number | null;
    skills?: string[] | null;
    role?: string | null;
    education?: string | null;
    rawText?: string | null;
  },
  job: {
    title: string;
    experience_required?: string | null;
    description?: string | null;
  }
): { eligible: boolean; reasons: string[] } {
  if (candidate.score < 80) {
    return { eligible: false, reasons: [`Score ${candidate.score} is below shortlist threshold (80).`] };
  }

  const result = evaluateCandidateDetailedScore({
    candidateExperienceYears: Number(candidate.experienceYears) || 0,
    requiredExperienceText: job.experience_required || undefined,
    candidateSkills: Array.isArray(candidate.skills) ? candidate.skills : [],
    candidateRole: candidate.role || "",
    jobTitle: job.title || "",
    candidateEducation: candidate.education || undefined,
    rawResumeText: candidate.rawText || undefined,
    jobDescriptionText: job.description || undefined
  });

  return {
    eligible: result.isEligible,
    reasons: result.ineligibilityReasons
  };
}
