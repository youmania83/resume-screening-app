// src/services/JobExtractionService.ts
import { DeepSeekLLMAdapter } from "../lib/ai/adapters/DeepSeekLLMAdapter.js";

export interface IJobDescriptionExtract {
  title: string;
  description: string;
  department: string;
  location: string;
  experienceRequired: string;
  skills: string[];
  workMode: string;
}

export class JobExtractionService {
  /**
   * Extracts structured Job Description details from raw email subject and body.
   */
  static async extractFromEmail(
    subject: string,
    body: string
  ): Promise<IJobDescriptionExtract> {
    try {
      const adapter = new DeepSeekLLMAdapter();
      console.log(`[Job Extraction] Invoking DeepSeek LLM adapter for job description parsing...`);

      const prompt = `You are an expert HR recruiting assistant. Parse this email containing a job description request and extract structured details.
      
Email Subject: ${subject}
Email Body:
${body}

Return ONLY a valid JSON object matching the following schema. Do NOT wrap in markdown backticks or include any other text.
{
  "title": "string (extracted job title, e.g., 'React Architect')",
  "description": "string (comprehensive job description details, requirements, and responsibilities)",
  "department": "string (e.g. Engineering, Sales, Human Resources, or 'Not Specified')",
  "location": "string (city/state location or 'Remote')",
  "experienceRequired": "string (e.g., '8+ years', 'Entry Level', or 'Not Specified')",
  "skills": ["array of specific technical or professional skills required"],
  "workMode": "string (must be one of: 'Remote', 'Hybrid', 'Onsite', or 'Not Specified')"
}`;

      const response = await adapter.generateText(prompt, { temperature: 0.1 });
      const cleanJsonStr = response
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      const parsed = JSON.parse(cleanJsonStr);

      return {
        title: parsed.title || this.extractTitleFallback(subject),
        description: parsed.description || body,
        department: parsed.department || "Engineering",
        location: parsed.location || "Remote",
        experienceRequired: parsed.experienceRequired || "Not Specified",
        skills: Array.isArray(parsed.skills) ? parsed.skills : [],
        workMode: parsed.workMode || "Remote",
      };
    } catch (err: any) {
      console.warn("[Job Extraction] AI extraction failed or timed out. Using regex fallback:", err.message || err);
      return this.fallbackRegexExtraction(subject, body);
    }
  }

  private static extractTitleFallback(subject: string): string {
    const cleanSubject = subject.replace(/^(?:Fwd|Re|New Job Description|Job Opening|Hiring|JD)\s*:\s*/i, "").trim();
    return cleanSubject || "New Ingested Job";
  }

  private static fallbackRegexExtraction(subject: string, body: string): IJobDescriptionExtract {
    const title = this.extractTitleFallback(subject);
    
    // Heuristically scan for metadata fields in email body
    const workModeMatch = body.match(/work\s*mode\s*:\s*(\w+)/i);
    const workMode = workModeMatch ? workModeMatch[1] : "Remote";

    const locMatch = body.match(/location\s*:\s*([^\n\r]+)/i);
    const location = locMatch ? locMatch[1].trim() : "Remote";

    const expMatch = body.match(/(?:experience|exp)\s*(?:required|req)?\s*:\s*([^\n\r]+)/i);
    const experienceRequired = expMatch ? expMatch[1].trim() : "Not Specified";

    const deptMatch = body.match(/department\s*:\s*([^\n\r]+)/i);
    const department = deptMatch ? deptMatch[1].trim() : "Engineering";

    // Standard fallback structure
    return {
      title,
      description: body,
      department,
      location,
      experienceRequired,
      skills: [],
      workMode
    };
  }
}
