import fetch from "node-fetch";
import { LLMAdapter, LLMOptions } from "./LLMAdapter.js";

export class DeepSeekLLMAdapter implements LLMAdapter {
  async generateText(prompt: string, options?: LLMOptions): Promise<string> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error("DEEPSEEK_API_KEY is not set in environment");
    }

    const temperature = options?.temperature ?? 0.3;
    const maxTokens = options?.maxTokens ?? 1024;

    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat", // standard DeepSeek model
        messages: [{ role: "user", content: prompt }],
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`DeepSeek API error ${response.status}: ${err}`);
    }

    const data: any = await response.json();
    return data.choices[0].message.content.trim();
  }
}
