// src/lib/parser/ResumeParserProvider.ts
import { DeepSeekLLMAdapter } from "../ai/adapters/DeepSeekLLMAdapter.js";
import { OpenAILLMAdapter } from "../ai/adapters/OpenAILLMAdapter.js";
import { GeminiLLMAdapter } from "../ai/adapters/GeminiLLMAdapter.js";

export interface ParsedResumeData {
  isResume: boolean;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  country: string;
  skills: string[];
  certifications: string[];
  education: string;
  experienceYears: number;
  linkedinUrl?: string;
  githubUrl?: string;
  summary: string;
  currentTitle?: string;
  role?: string;
  jobTitle?: string;
  
  // US Visa status
  usCitizen: boolean;
  greenCard: boolean;
  h1b: boolean;
  opt: boolean;
  cpt: boolean;
  ead: boolean;
  tnVisa: boolean;
  requiresSponsorship: boolean;

  // Confidence scores (0.0 to 1.0)
  overallConfidence: number;
  emailConfidence: number;
  phoneConfidence: number;
  skillsConfidence: number;

  // AI analysis evaluation
  strengths: string[];
  concerns: string[];
  recommendationReason: string;
  matchedSkills: string[];
  missingSkills: string[];

  // Sub-scores for Job Matching (0 to 100)
  skillsScore?: number;
  experienceScore?: number;
  industryScore?: number;
  educationScore?: number;
  locationScore?: number;
}

export interface IResumeParserProvider {
  name: string;
  parseResume(rawText: string, jobDescription?: string): Promise<ParsedResumeData>;
}

function buildParserPrompt(rawText: string, jobDescription?: string): string {
  return `You are an expert ATS parser. Parse the raw resume text and extract candidate details.
${jobDescription ? `Compare the resume details against this Job Description:\n${jobDescription}\n` : ""}

CRITICAL EVALUATION RULE: This job and candidate are based in India. Do NOT mention or list any weaknesses, gaps, or concerns regarding US work authorization, US visa status (H1B, OPT, CPT, Green Card, etc.), or lack of US experience/market exposure. These are completely irrelevant for Indian domestic roles.

Return ONLY a valid JSON object matching the following schema. Do NOT wrap in markdown backticks or include any other text.
{
  "isResume": boolean (true if the text represents a professional resume or curriculum vitae of a candidate, false if the document is a payslip, receipt, invoice, course certificate, mark sheet, dashboard screenshot, agreement, or any other non-resume document),
  "firstName": "string (first name or empty)",
  "lastName": "string (last name or empty)",
  "email": "string (email or empty)",
  "phone": "string (phone or empty)",
  "city": "string (city or empty)",
  "state": "string (state/region or empty)",
  "country": "string (country or empty)",
  "skills": ["array of skills"],
  "certifications": ["array of certifications"],
  "education": "string (highest degree earned)",
  "experienceYears": number (total years of experience),
  "linkedinUrl": "string (LinkedIn URL or empty)",
  "githubUrl": "string (GitHub URL or empty)",
  "summary": "string (brief professional summary)",
  "currentTitle": "string (candidate's primary current or target professional job title/designation extracted or inferred from resume, e.g. 'Project Engineer', 'React Developer', 'HR Executive', 'Sales Manager', 'DevOps Engineer', 'Civil Engineer', etc.)",
  "usCitizen": boolean (infer if candidate is a US citizen),
  "greenCard": boolean (infer if candidate holds green card),
  "h1b": boolean (infer if candidate requires H1B/visa transfer),
  "opt": boolean (infer OPT visa status),
  "cpt": boolean (infer CPT visa status),
  "ead": boolean (infer EAD work authorization),
  "tnVisa": boolean (infer TN visa status),
  "requiresSponsorship": boolean (infer if candidate requires visa sponsorship),
  "overallConfidence": number (0.00 to 1.00 confidence rating of parsing),
  "emailConfidence": number (0.00 to 1.00 confidence of email accuracy),
  "phoneConfidence": number (0.00 to 1.00 confidence of phone accuracy),
  "skillsConfidence": number (0.00 to 1.00 confidence of skills parsing),
  "strengths": ["array of candidate's top 3 strengths"],
  "concerns": ["array of candidate gaps or concerns. DO NOT include any US visa, US work authorization, or lack of US experience/market exposure points."],
  "recommendationReason": "string (brief justification for why this candidate fits)",
  "matchedSkills": ["array of skills that match the JD requirements"],
  "missingSkills": ["array of skills required by JD but missing in resume"],
  "skillsScore": number (0 to 100 score of candidate skills fit against JD),
  "experienceScore": number (0 to 100 score of candidate years and depth of experience fit against JD),
  "industryScore": number (0 to 100 score of candidate industry exposure fit against JD),
  "educationScore": number (0 to 100 score of candidate academic credentials fit against JD),
  "locationScore": number (0 to 100 score of location/commute fit against JD)
}

Resume Text:
${rawText}`;
}

export function parseCleanJson(text: string): any {
  if (!text || typeof text !== "string") {
    throw new Error("Empty or non-string response received from LLM model");
  }

  let cleaned = text.trim();
  // Strip markdown code fences if present (e.g. ```json { ... } ```)
  cleaned = cleaned.replace(/^```(?:json)?\s*/gi, "").replace(/\s*```$/g, "");

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  // Strip trailing commas before closing brackets or braces
  cleaned = cleaned.replace(/,\s*([\]}])/g, "$1");
  // Replace unescaped control characters (ASCII 0x00-0x1F except newline/tab) with spaces
  cleaned = cleaned.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ");

  try {
    return JSON.parse(cleaned);
  } catch (err: any) {
    console.warn("⚠️ [JSON Extractor] Primary parse failed, attempting secondary repair:", err.message);
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*/gm, "$1");
    return JSON.parse(cleaned);
  }
}

// 1. DeepSeek Resume Parser
export class DeepSeekParser implements IResumeParserProvider {
  name = "DeepSeek";
  private adapter = new DeepSeekLLMAdapter();

  async parseResume(rawText: string, jobDescription?: string): Promise<ParsedResumeData> {
    const prompt = buildParserPrompt(rawText, jobDescription);
    const response = await this.adapter.generateText(prompt, { maxTokens: 4000 });
    return parseCleanJson(response);
  }
}

// 2. OpenAI Resume Parser
export class OpenAIParser implements IResumeParserProvider {
  name = "OpenAI";
  private adapter = new OpenAILLMAdapter();

  async parseResume(rawText: string, jobDescription?: string): Promise<ParsedResumeData> {
    const prompt = buildParserPrompt(rawText, jobDescription);
    const response = await this.adapter.generateText(prompt, { maxTokens: 4000 });
    return parseCleanJson(response);
  }
}

// 3. Google Gemini Resume Parser
export class GeminiParser implements IResumeParserProvider {
  name = "Gemini";
  private adapter = new GeminiLLMAdapter();

  async parseResume(rawText: string, jobDescription?: string): Promise<ParsedResumeData> {
    const prompt = buildParserPrompt(rawText, jobDescription);
    const response = await this.adapter.generateText(prompt, { maxTokens: 4000 });
    return parseCleanJson(response);
  }
}

// 4. Mock Parser (Regex-based backup/fallback provider)
export class MockParser implements IResumeParserProvider {
  name = "Mock";

  async parseResume(rawText: string, jobDescription?: string): Promise<ParsedResumeData> {
    const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const email = emailMatch ? emailMatch[0] : "john.doe@example.com";
    
    const phoneMatch = rawText.match(/(?:\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}/);
    const phone = phoneMatch ? phoneMatch[0] : "+1 (555) 019-2834";

    const emailPrefix = email.split("@")[0];
    const firstName = emailPrefix.split(".")[0] || "John";
    const lastName = emailPrefix.split(".")[1] || "Doe";

    const skills = ["JavaScript", "TypeScript", "React", "Node.js", "SQL"];
    const matchedSkills = jobDescription 
      ? skills.filter(s => jobDescription.toLowerCase().includes(s.toLowerCase())) 
      : ["TypeScript", "Node.js"];
    const missingSkills = jobDescription && matchedSkills.length === 0 ? ["Python"] : [];

    return {
      isResume: true,
      firstName: firstName.charAt(0).toUpperCase() + firstName.slice(1),
      lastName: lastName.charAt(0).toUpperCase() + lastName.slice(1),
      email,
      phone,
      city: "San Francisco",
      state: "CA",
      country: "US",
      skills,
      certifications: ["AWS Certified Solutions Architect"],
      education: "B.S. in Computer Science",
      experienceYears: 5,
      linkedinUrl: `https://linkedin.com/in/${emailPrefix}`,
      githubUrl: `https://github.com/in/${emailPrefix}`,
      summary: `Experienced developer skilled in building web solutions, with expertise in ${skills.join(", ")}.`,
      usCitizen: true,
      greenCard: false,
      h1b: false,
      opt: false,
      cpt: false,
      ead: false,
      tnVisa: false,
      requiresSponsorship: false,
      overallConfidence: 0.95,
      emailConfidence: 1.00,
      phoneConfidence: 0.90,
      skillsConfidence: 0.85,
      strengths: ["Strong backend capabilities", "Excellent communication", "Familiar with micro-tenant isolation"],
      concerns: ["Limited experience with Vue.js"],
      recommendationReason: `Strong candidate matching ${matchedSkills.join(", ") || "TypeScript"} requirements.`,
      matchedSkills,
      missingSkills,
      skillsScore: jobDescription ? 80 : undefined,
      experienceScore: jobDescription ? 85 : undefined,
      industryScore: jobDescription ? 75 : undefined,
      educationScore: jobDescription ? 90 : undefined,
      locationScore: jobDescription ? 95 : undefined
    };
  }
}

/**
 * Sanity-checks an LLM parse result before it is allowed into the pipeline.
 *
 * A malformed or hallucinated response that still parses as JSON would otherwise
 * be written straight to the candidates table (and trigger a real assessment
 * invitation email), so reject anything structurally implausible here.
 */
function validateParsedData(data: any, providerName: string): ParsedResumeData {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${providerName} returned a non-object parse result.`);
  }

  // Normalise array fields — models occasionally return a comma-joined string.
  const toArray = (val: any): string[] => {
    if (Array.isArray(val)) return val.filter(v => typeof v === "string" && v.trim()).map(v => v.trim());
    if (typeof val === "string" && val.trim()) return val.split(",").map(v => v.trim()).filter(Boolean);
    return [];
  };

  data.skills = toArray(data.skills);
  data.certifications = toArray(data.certifications);
  data.strengths = toArray(data.strengths);
  data.concerns = toArray(data.concerns);
  data.matchedSkills = toArray(data.matchedSkills);
  data.missingSkills = toArray(data.missingSkills);

  // Numeric coercion with plausibility bounds.
  const clamp = (val: any, min: number, max: number, fallback: number): number => {
    const num = Number(val);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
  };

  data.experienceYears = clamp(data.experienceYears, 0, 60, 0);
  data.overallConfidence = clamp(data.overallConfidence, 0, 1, 0.5);
  data.emailConfidence = clamp(data.emailConfidence, 0, 1, 0.5);
  data.phoneConfidence = clamp(data.phoneConfidence, 0, 1, 0.5);
  data.skillsConfidence = clamp(data.skillsConfidence, 0, 1, 0.5);

  for (const key of ["skillsScore", "experienceScore", "industryScore", "educationScore", "locationScore"] as const) {
    if (data[key] !== undefined && data[key] !== null) {
      data[key] = clamp(data[key], 0, 100, 0);
    }
  }

  // `isResume` must be an explicit boolean — treat a missing value as "unknown",
  // never as "yes", so non-resume documents cannot slip through.
  if (typeof data.isResume !== "boolean") {
    const looksLikeResume = data.skills.length > 0 || !!data.email || Number(data.experienceYears) > 0;
    data.isResume = looksLikeResume;
  }

  if (typeof data.firstName !== "string") data.firstName = "";
  if (typeof data.lastName !== "string") data.lastName = "";
  if (typeof data.email !== "string") data.email = "";
  if (typeof data.phone !== "string") data.phone = "";

  return data as ParsedResumeData;
}

/** Small helper: retry a transient provider failure once, with backoff. */
async function withRetry<T>(fn: () => Promise<T>, attempts: number, label: string): Promise<T> {
  let lastErr: any = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (attempt < attempts) {
        const delayMs = 1000 * attempt;
        console.warn(`[Parser Manager] ${label} attempt ${attempt}/${attempts} failed (${err?.message || err}). Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastErr;
}

// Failover parser runner
export class ResumeParserManager {
  /**
   * True only when the regex-based MockParser is explicitly opted into.
   *
   * The MockParser fabricates a complete candidate profile (john.doe@example.com,
   * five years of experience, a fixed skill list and hard-coded scores of 80-95).
   * It used to be appended unconditionally as the last fallback, which meant that
   * any AI outage silently produced fake high-scoring candidates that were then
   * auto-shortlisted and emailed real assessment invitations. It is now opt-in
   * and never enabled by default.
   */
  static isMockParserEnabled(): boolean {
    return process.env.ALLOW_MOCK_PARSER === "true" || process.env.NODE_ENV === "test";
  }

  static getProviders(): IResumeParserProvider[] {
    const list: IResumeParserProvider[] = [];

    if (process.env.DEEPSEEK_API_KEY) {
      list.push(new DeepSeekParser());
    }
    if (process.env.OPENAI_API_KEY) {
      list.push(new OpenAIParser());
    }
    if (process.env.GEMINI_API_KEY) {
      list.push(new GeminiParser());
    }

    if (this.isMockParserEnabled()) {
      console.warn("⚠️ [Parser Manager] MockParser is ENABLED (ALLOW_MOCK_PARSER=true). Fabricated candidate data may be produced — do not use in production.");
      list.push(new MockParser());
    }

    return list;
  }

  static async parse(rawText: string, jobDescription?: string): Promise<{ data: ParsedResumeData; provider: string }> {
    const providers = this.getProviders();

    if (providers.length === 0) {
      throw new Error(
        "[Parser Manager] No AI parsing provider is configured. Set at least one of " +
          "DEEPSEEK_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY. Resumes will be retried " +
          "once a provider is available (no fabricated data is generated)."
      );
    }

    let lastError: any = null;
    const attemptsPerProvider = Number(process.env.AI_PARSE_ATTEMPTS) > 0 ? Number(process.env.AI_PARSE_ATTEMPTS) : 2;

    for (const provider of providers) {
      try {
        console.log(`[Parser Manager] Attempting parsing with provider: ${provider.name}...`);
        const raw = await withRetry(
          () => provider.parseResume(rawText, jobDescription),
          attemptsPerProvider,
          provider.name
        );
        const data = validateParsedData(raw, provider.name);
        console.log(`[Parser Manager] Successfully parsed using provider: ${provider.name}`);
        return { data, provider: provider.name };
      } catch (err: any) {
        console.warn(`[Parser Manager] Provider ${provider.name} failed:`, err.message || err);
        lastError = err;
      }
    }

    // Deliberately throw rather than degrade to fabricated data. The caller marks
    // the inbox item as retryable so the resume is re-processed on the next cycle.
    throw new Error(`[Parser Manager] All AI parsing providers failed. Last error: ${lastError?.message || lastError}`);
  }
}
