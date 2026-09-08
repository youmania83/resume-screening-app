// src/lib/scoreCalculator.ts
import { getRoleFamilyScore, ROLE_COMPAT_SHORTLIST_THRESHOLD } from "./roleCompatibility.js";

export interface ScoreCalculationInput {
  candidateExperienceYears: number;
  requiredExperienceText?: string;
  candidateSkills?: string[];
  jobRequiredSkills?: string[];
  candidateRole?: string;
  jobTitle?: string;
  baseAiScore?: number;
}

/**
 * Calculates a precision AI match score (0-100%) based on reconciled candidate data
 * (experience fit, skill match ratio, role alignment).
 */
export function calculatePrecisionCandidateScore(input: ScoreCalculationInput): number {
  const {
    candidateExperienceYears,
    requiredExperienceText,
    candidateSkills = [],
    jobRequiredSkills = [],
    candidateRole = "",
    jobTitle = "",
    baseAiScore
  } = input;

  // 1. Calculate Required Years from JD
  let requiredYears = 2; // default
  if (requiredExperienceText) {
    const match = requiredExperienceText.match(/(\d+)/);
    if (match && match[1]) {
      requiredYears = parseInt(match[1], 10);
    }
  }

  // 2. Compute Experience Sub-Score (0-100)
  let expScore = 60;
  if (candidateExperienceYears >= requiredYears) {
    expScore = 100;
  } else if (requiredYears > 0) {
    expScore = Math.max(20, Math.round((candidateExperienceYears / requiredYears) * 100));
  }

  // 3. Compute Skills Match Sub-Score (0-100)
  let skillsScore = 70; // default baseline
  if (jobRequiredSkills.length > 0 && candidateSkills.length > 0) {
    const matchedCount = candidateSkills.filter(cs =>
      jobRequiredSkills.some(js => js.toLowerCase().includes(cs.toLowerCase()) || cs.toLowerCase().includes(js.toLowerCase()))
    ).length;
    skillsScore = Math.min(100, Math.max(30, Math.round((matchedCount / jobRequiredSkills.length) * 100)));
  } else if (candidateSkills.length >= 5) {
    skillsScore = 85;
  }

  // 4. Role Alignment Sub-Score (0-100)
  //
  // Uses the role-family compatibility matrix so that a Welder applying for a
  // Senior Proposal Engineer role scores near 10, not the old default of 70.
  //
  // Default is 35 (unknown/unclassified) — we penalise uncertainty rather than
  // reward it, because a missing title most often means the candidate doesn't
  // fit the role.
  let roleScore = 35;
  if (candidateRole && jobTitle) {
    const cRoleLower = candidateRole.toLowerCase();
    const jTitleLower = jobTitle.toLowerCase();
    // Exact string match still gives 100
    if (cRoleLower.includes(jTitleLower) || jTitleLower.includes(cRoleLower)) {
      roleScore = 100;
    } else {
      // Use cross-family compatibility as the role score
      roleScore = getRoleFamilyScore(candidateRole, jobTitle);
    }
  }

  // Weighted Combination:
  // - Base AI Score (if available): 35%
  // - Experience Fit:               25%
  // - Skills Fit:                   15%
  // - Role Fit:                     25%   ← raised from 10% — the most
  //                                          important guard against cross-role
  //                                          mismatches
  let finalScore: number;
  if (typeof baseAiScore === "number" && baseAiScore > 0) {
    finalScore = Math.round(baseAiScore * 0.35 + expScore * 0.25 + skillsScore * 0.15 + roleScore * 0.25);
  } else {
    finalScore = Math.round(expScore * 0.35 + skillsScore * 0.40 + roleScore * 0.25);
  }

  // Hard cap: if the candidate's role family is clearly incompatible with the
  // job (compatibility < ROLE_COMPAT_SHORTLIST_THRESHOLD), never let the
  // computed score cross the 80% auto-shortlist threshold, regardless of
  // experience or keyword overlap.  HR can still manually promote.
  const familyCompatScore = getRoleFamilyScore(candidateRole, jobTitle);
  if (familyCompatScore < ROLE_COMPAT_SHORTLIST_THRESHOLD) {
    finalScore = Math.min(finalScore, 74);
  }

  return Math.min(100, Math.max(10, finalScore));
}
