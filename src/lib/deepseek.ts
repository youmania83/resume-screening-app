// src/lib/deepseek.ts
/**
 * Minimal DeepSeek wrapper (free tier).
 * Expects environment variable DEEPSEEK_API_KEY.
 * Uses fetch (node >=18) to call the Completion endpoint.
 */
import fetch from "node-fetch";

type DeepSeekResponse = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

/**
 * Sends a prompt to DeepSeek and returns the assistant's content.
 */
export async function callDeepSeek(prompt: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not set in environment");
  }

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-coder", // free tier model name
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek API error ${response.status}: ${err}`);
  }

  const data = (await response.json()) as DeepSeekResponse;
  return data.choices[0].message.content.trim();
}
