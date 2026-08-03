// src/lib/scoreCalculator.ts

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
  let roleScore = 70;
  if (candidateRole && jobTitle) {
    const cRoleLower = candidateRole.toLowerCase();
    const jTitleLower = jobTitle.toLowerCase();
    if (cRoleLower.includes(jTitleLower) || jTitleLower.includes(cRoleLower)) {
      roleScore = 100;
    }
  }

  // Weighted Combination:
  // - Base AI Score (if available): 40%
  // - Experience Fit: 30%
  // - Skills Fit: 20%
  // - Role Fit: 10%
  let finalScore: number;
  if (typeof baseAiScore === "number" && baseAiScore > 0) {
    finalScore = Math.round(baseAiScore * 0.4 + expScore * 0.3 + skillsScore * 0.2 + roleScore * 0.1);
  } else {
    finalScore = Math.round(expScore * 0.4 + skillsScore * 0.4 + roleScore * 0.2);
  }

  return Math.min(100, Math.max(10, finalScore));
}
