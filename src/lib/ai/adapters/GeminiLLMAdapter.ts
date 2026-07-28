import fetch from "node-fetch";
import { LLMAdapter, LLMOptions } from "./LLMAdapter.js";

export class GeminiLLMAdapter implements LLMAdapter {
  async generateText(prompt: string, options?: LLMOptions): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set in environment");
    }

    const temperature = options?.temperature ?? 0.3;
    const maxTokens = options?.maxTokens ?? 1024;

    const geminiModel = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${err}`);
    }

    const data: any = await response.json();
    
    try {
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error("Empty content in Gemini response candidate parts");
      }
      return text.trim();
    } catch (e: any) {
      console.error("Failed to parse Gemini response payload:", JSON.stringify(data));
      throw new Error(`Failed to parse Gemini response payload: ${e.message}`);
    }
  }
}
