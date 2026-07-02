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

    const maxRetries = 2;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 14000); // 14s timeout per attempt to fit within client limits

      try {
        console.log(`🤖 DeepSeek API request (Attempt ${attempt}/${maxRetries})...`);
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
          signal: controller.signal as any,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`DeepSeek API error ${response.status}: ${err}`);
        }

        const data: any = await response.json();
        return data.choices[0].message.content.trim();
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err;
        const isTimeout = err.name === "AbortError";
        console.warn(`⚠️ DeepSeek attempt ${attempt} failed (Timeout: ${isTimeout}): ${err.message}`);
        if (attempt < maxRetries) {
          // Wait 1 second before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    throw lastError || new Error("DeepSeek request failed after retries");
  }
}

