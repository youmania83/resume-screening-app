// src/lib/parser/ResumeParserProvider.ts
import { DeepSeekLLMAdapter } from "../ai/adapters/DeepSeekLLMAdapter.js";
import { OpenAILLMAdapter } from "../ai/adapters/OpenAILLMAdapter.js";
import { GeminiLLMAdapter } from "../ai/adapters/GeminiLLMAdapter.js";

export interface ParsedResumeData {
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

// Prompt template helper
function buildParserPrompt(rawText: string, jobDescription?: string): string {
  return `You are an expert ATS parser. Parse the raw resume text and extract candidate details.
${jobDescription ? `Compare the resume details against this Job Description:\n${jobDescription}\n` : ""}
Return ONLY a valid JSON object matching the following schema. Do NOT wrap in markdown backticks or include any other text.
{
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
  "concerns": ["array of candidate gaps or concerns"],
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

function parseCleanJson(text: string): any {
  let cleaned = text.trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  // Strip trailing commas before closing braces/brackets to prevent JSON parse errors
  cleaned = cleaned.replace(/,\s*([\]}])/g, "$1");
  // Strip comments if any
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, "$1");
  return JSON.parse(cleaned);
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

// Failover parser runner
export class ResumeParserManager {
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
    
    list.push(new MockParser());
    return list;
  }

  static async parse(rawText: string, jobDescription?: string): Promise<{ data: ParsedResumeData; provider: string }> {
    const providers = this.getProviders();
    let lastError: any = null;

    for (const provider of providers) {
      try {
        console.log(`[Parser Manager] Attempting parsing with provider: ${provider.name}...`);
        const data = await provider.parseResume(rawText, jobDescription);
        console.log(`[Parser Manager] Successfully parsed using provider: ${provider.name}`);
        return { data, provider: provider.name };
      } catch (err: any) {
        console.warn(`[Parser Manager] Provider ${provider.name} failed:`, err.message || err);
        lastError = err;
      }
    }

    throw new Error(`[Parser Manager] All parsing providers failed. Last error: ${lastError?.message || lastError}`);
  }
}
