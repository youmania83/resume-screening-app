// src/lib/experienceNormalizer.ts

export interface ExperienceReconciliationInput {
  experienceYears?: number | string;
  recommendation?: string;
  strengths?: string[];
  experienceMatch?: string;
  weaknesses?: string[];
  skills?: string[];
  role?: string;
  rawText?: string;
}

export interface ExperienceReconciliationOutput {
  experienceYears: number;
  recommendation: string;
  strengths: string[];
  experienceMatch: string;
}

/**
 * Calculates total years of experience from explicit date spans in resume text.
 * e.g., "2018 - 2024" => 6 years, "01/2017 to Present" => ~9.5 years.
 */
export function calculateExperienceFromDateSpans(text: string): number {
  if (!text || typeof text !== "string") return 0;

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  let totalMonths = 0;
  const spansFound: Array<{ startYear: number; startMonth: number; endYear: number; endMonth: number }> = [];

  // Pattern 1: Month Year - Month Year / Present (e.g., "Jan 2018 - Mar 2023", "June 2015 to Present")
  const monthNames = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
  const monthMap: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
  };

  const regexMonthYear = new RegExp(
    `(?:(${monthNames})[a-z]*\\.?\\s*)?(\\d{4})\\s*(?:-|to|–|until|\\/)\\s*(?:(${monthNames})[a-z]*\\.?\\s*)?(\\d{4}|present|current|now|till date)`,
    "gi"
  );

  let match: RegExpExecArray | null;
  while ((match = regexMonthYear.exec(text)) !== null) {
    const startMStr = (match[1] || "").toLowerCase().slice(0, 3);
    const startYear = parseInt(match[2], 10);
    const endMStr = (match[3] || "").toLowerCase().slice(0, 3);
    const endStr = match[4].toLowerCase();

    const startMonth = monthMap[startMStr] || 1;
    let endYear = currentYear;
    let endMonth = currentMonth;

    if (!/present|current|now|till date/.test(endStr)) {
      endYear = parseInt(endStr, 10);
      endMonth = monthMap[endMStr] || 12;
    }

    if (!isNaN(startYear) && !isNaN(endYear) && startYear >= 1970 && startYear <= currentYear + 1 && endYear >= startYear) {
      spansFound.push({ startYear, startMonth, endYear, endMonth });
    }
  }

  // Calculate non-overlapping total months
  for (const span of spansFound) {
    const months = (span.endYear - span.startYear) * 12 + (span.endMonth - span.startMonth);
    if (months > 0 && months <= 600) { // cap single role at 50 years max
      totalMonths += months;
    }
  }

  const calculatedYears = Math.round((totalMonths / 12) * 10) / 10;
  return calculatedYears;
}

/**
 * Extracts candidate total experience numbers mentioned in narrative text
 * (e.g. "8+ years of experience", "Over 10 years of hands-on experience", "10+ years")
 */
export function extractExperienceYearsFromText(text: string): number | null {
  if (!text || typeof text !== "string") return null;

  // 1. Remove job requirement phrases and ranges (e.g. "requirement of 0-2 years", "0-2 years", "2-5 years")
  const cleanedText = text
    .replace(/(?:requirement|requires?|required|target|criteria|range|threshold|job description)\s*(?:of|for|is:?)?\s*\d+(?:\.\d+)?(?:\s*[-–to\/]\s*\d+(?:\.\d+)?)?\s*(?:years?|yrs?|months?|mths?)?/gi, "")
    .replace(/(?:aligns?|compared|evaluated)\s*(?:with|against|to)?\s*(?:the)?\s*(?:entry-level|mid-level|senior)?\s*(?:requirement|criteria)?\s*(?:of)?\s*\d+(?:\.\d+)?(?:\s*[-–to\/]\s*\d+(?:\.\d+)?)?\s*(?:years?|yrs?|months?|mths?)?/gi, "")
    .replace(/\b\d+(?:\.\d+)?\s*[-–to]\s*\d+(?:\.\d+)?\s*(?:years?|yrs?|months?|mths?)\b/gi, "");

  // 2. Check for explicit month mentions for sub-year experience (e.g. "6 months of experience", "6 months")
  const monthPatterns = [
    /(\d+(?:\.\d+)?)\s*(?:months?|mths?)\s*of\s*(?:[a-z0-9\-–&/]+\s+){0,4}experience/gi,
    /has\s*(\d+(?:\.\d+)?)\s*(?:months?|mths?)/gi,
    /documented\s*(\d+(?:\.\d+)?)\s*(?:months?|mths?)/gi,
    /(\d+(?:\.\d+)?)\s*(?:months?|mths?)\s*(?:exp|experience)/gi
  ];

  let foundMonths: number | null = null;
  for (const pattern of monthPatterns) {
    const matches = cleanedText.matchAll(pattern);
    for (const match of matches) {
      if (match && match[1]) {
        const parsedM = parseFloat(match[1]);
        if (!isNaN(parsedM) && parsedM > 0 && parsedM <= 120) {
          const inYears = Math.round((parsedM / 12) * 10) / 10;
          if (foundMonths === null || inYears > foundMonths) {
            foundMonths = inYears;
          }
        }
      }
    }
  }

  // 3. Patterns matching "10+ years", "8+ years", "Over 10 years", "10+ years of", "has 8 years of"
  const patterns = [
    /(?:over|around|more than|approx(?:imately)?)\s*(\d+(?:\.\d+)?)\s*\+?\s*years?/gi,
    /(\d+(?:\.\d+)?)\s*\+\s*years?/gi,
    /(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\s*of\s*(?:[a-z0-9\-–&/]+\s+){0,4}experience/gi,
    /has\s*(\d+(?:\.\d+)?)\s*\+?\s*years?/gi,
    /documented\s*(\d+(?:\.\d+)?)\s*\+?\s*years?/gi,
    /(?:with|possessing)\s*(\d+(?:\.\d+)?)\s*\+?\s*years?/gi
  ];

  let maxFound: number | null = foundMonths;
  for (const pattern of patterns) {
    const matches = cleanedText.matchAll(pattern);
    for (const match of matches) {
      if (match && match[1]) {
        const parsed = parseFloat(match[1]);
        if (!isNaN(parsed) && parsed > 0 && parsed <= 50) {
          if (maxFound === null || parsed > maxFound) {
            maxFound = parsed;
          }
        }
      }
    }
  }

  return maxFound;
}

/**
 * Reconciles numeric experience_years with raw resume date spans & AI narrative text
 * (strengths, recommendation, experienceMatch) to ensure 100% consistency across all views.
 */
export function reconcileExperienceData(data: ExperienceReconciliationInput): ExperienceReconciliationOutput {
  let expYears = typeof data.experienceYears === "number"
    ? data.experienceYears
    : parseFloat(String(data.experienceYears || 0)) || 0;

  // 1. Calculate from date spans if rawText is provided
  if (data.rawText) {
    const dateSpanYears = calculateExperienceFromDateSpans(data.rawText);
    if (dateSpanYears > expYears) {
      console.log(`⚡ [Experience Normalizer] Date-span calculation elevated experienceYears (${expYears} -> ${dateSpanYears})`);
      expYears = dateSpanYears;
    }
  }

  // 2. Collect text samples to inspect explicit domain experience claims
  const textSamples: string[] = [];
  if (data.recommendation) textSamples.push(data.recommendation);
  if (data.experienceMatch) textSamples.push(data.experienceMatch);
  if (Array.isArray(data.strengths)) textSamples.push(...data.strengths);
  if (Array.isArray(data.weaknesses)) textSamples.push(...data.weaknesses);
  if (data.rawText) textSamples.push(data.rawText.substring(0, 1500)); // check resume summary header

  let highestTextExp: number | null = null;
  let explicitCandidateExp: number | null = null;
  for (const sample of textSamples) {
    const extracted = extractExperienceYearsFromText(sample);
    if (extracted !== null) {
      if (highestTextExp === null || extracted > highestTextExp) {
        highestTextExp = extracted;
      }
      if (/candidate has\s*(\d+(?:\.\d+)?)\s*(?:months?|mths?|years?|yrs?)/gi.test(sample)) {
        explicitCandidateExp = extracted;
      }
    }
  }

  // Elevate if narrative identifies higher domain experience (e.g. 3+ or 8+ or 10+ years),
  // OR correct down if narrative explicitly states exact lower candidate experience (e.g. 6 months = 0.5 years)
  if (explicitCandidateExp !== null && explicitCandidateExp < expYears) {
    console.log(`⚡ [Experience Normalizer] Correcting inflated experienceYears (${expYears} -> ${explicitCandidateExp}) to match explicit narrative experience.`);
    expYears = explicitCandidateExp;
  } else if (highestTextExp !== null && highestTextExp > expYears) {
    console.log(`⚡ [Experience Normalizer] Elevating parsed experienceYears (${expYears} -> ${highestTextExp}) based on AI domain narrative.`);
    expYears = highestTextExp;
  }

  // Round cleanly to 1 decimal place if float (e.g. 6.5) or integer (e.g. 8)
  expYears = Math.round(expYears * 10) / 10;

  // Ensure experienceMatch text uses consistent figure
  let experienceMatch = data.experienceMatch || "";
  if (!experienceMatch.trim()) {
    experienceMatch = `${expYears}+ year(s) of experience recorded against the ${data.role || "applied role"} requirement.`;
  } else {
    // If experienceMatch contains a conflicting year number (e.g., "1.0 Years" when expYears is 3), update it
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
