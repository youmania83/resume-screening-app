import fetch from "node-fetch";
import { LLMAdapter, LLMOptions } from "./LLMAdapter.js";

export class OpenAILLMAdapter implements LLMAdapter {
  async generateText(prompt: string, options?: LLMOptions): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set in environment");
    }

    const temperature = options?.temperature ?? 0.3;
    const maxTokens = options?.maxTokens ?? 1024;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // Fast, accurate, and cost-effective model
        messages: [{ role: "user", content: prompt }],
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${err}`);
    }

    const data: any = await response.json();
    return data.choices[0].message.content.trim();
  }
}
