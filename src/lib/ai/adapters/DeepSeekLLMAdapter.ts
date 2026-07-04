import OpenAI from "openai";
import { LLMAdapter, LLMOptions } from "./LLMAdapter.js";

export class DeepSeekLLMAdapter implements LLMAdapter {
  async generateText(prompt: string, options?: LLMOptions): Promise<string> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error("DEEPSEEK_API_KEY is not set in environment");
    }

    const temperature = options?.temperature ?? 0.3;
    const maxTokens = options?.maxTokens ?? 4096;

    const maxRetries = 2;
    let lastError: any = null;

    const openai = new OpenAI({
      baseURL: "https://api.deepseek.com",
      apiKey,
    });

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🤖 DeepSeek (chat) API request (Attempt ${attempt}/${maxRetries})...`);
        const completion = await openai.chat.completions.create({
          model: "deepseek-chat",
          messages: [{ role: "user", content: prompt }],
          temperature,
          max_tokens: maxTokens,
          stream: false,
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) {
          throw new Error("Empty response received from DeepSeek");
        }
        return content.trim();
      } catch (err: any) {
        lastError = err;
        console.warn(`⚠️ DeepSeek attempt ${attempt} failed: ${err.message}`);
        if (attempt < maxRetries) {
          // Wait 1 second before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    throw lastError || new Error("DeepSeek request failed after retries");
  }
}
