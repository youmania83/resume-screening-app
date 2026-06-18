// src/lib/scoring.ts
/**
 * Scoring Service
 * ----------------
 * Takes a job description (JD) and a candidate's extracted resume text, builds a prompt
 * for DeepSeek, and returns a numeric score (0‑100) plus a JSON breakdown of the evaluation.
 *
 * The prompt is crafted to be deterministic and cheap (free tier model `deepseek-coder`).
 * It asks DeepSeek to:
 *   1. Compare the resume against key requirements.
 *   2. Return a JSON object with individual criterion scores and an overall weighted score.
 *
 * Example return shape:
 * {
 *   "overall": 84,
 *   "criteria": {
 *     "experience": 90,
 *     "skills": 80,
 *     "education": 85,
 *     "cultureFit": 78
 *   }
 * }
 */
import { callDeepSeek } from "./deepseek";
import { pool } from "./db";

type ScoreResult = {
  overall: number;
  criteria: Record<string, number>;
};

/**
 * Fetches the raw resume text for a given batchId from the `resume_texts` table.
 */
async function getResumeText(batchId: string): Promise<string> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT raw_text FROM resume_texts WHERE batch_id = $1 LIMIT 1;`,
      [batchId]
    );
    if (res.rowCount === 0) {
      throw new Error(`No resume text found for batchId ${batchId}`);
    }
    return res.rows[0].raw_text as string;
  } finally {
    client.release();
  }
}

/**
 * Build a prompt that asks DeepSeek to evaluate the candidate.
 * The prompt asks for JSON output to make parsing reliable.
 */
function buildPrompt(jobDescription: string, resumeText: string): string {
  return `You are an expert recruiter. Evaluate the following candidate resume against the job description provided.

Job Description:\n${jobDescription}\n\nCandidate Resume:\n${resumeText}\n\nScore the candidate on the following criteria (0-100): experience, skills, education, culture fit. Use the following weighting: experience 40%, skills 30%, education 20%, culture fit 10%.
Return ONLY a JSON object with the shape {\"overall\": number, \"criteria\": {\"experience\": number, \"skills\": number, \"education\": number, \"cultureFit\": number}}. Do not include any additional text.`;
}

/**
 * Public API: given a batchId and a job description, compute the score.
 */
export async function computeScore(batchId: string, jobDescription: string): Promise<ScoreResult> {
  const resumeText = await getResumeText(batchId);
  const prompt = buildPrompt(jobDescription, resumeText);
  const response = await callDeepSeek(prompt);
  // DeepSeek should return pure JSON – attempt to parse safely.
  try {
    const parsed = JSON.parse(response) as ScoreResult;
    return parsed;
  } catch (e) {
    console.error("Failed to parse DeepSeek response as JSON:", response);
    throw new Error("Invalid scoring response from DeepSeek");
  }
}
