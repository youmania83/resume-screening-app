import { getLLMAdapter } from "./adapters/index.js";
import { LLMOptions } from "./adapters/LLMAdapter.js";
import { DeepSeekLLMAdapter } from "./adapters/DeepSeekLLMAdapter.js";
import { OpenAILLMAdapter } from "./adapters/OpenAILLMAdapter.js";
import { GeminiLLMAdapter } from "./adapters/GeminiLLMAdapter.js";

export class AIService {
  /**
   * General text generation method routing to the active model provider.
   * If the primary configured provider fails, falls back sequentially to others.
   */
  async generateText(prompt: string, options?: LLMOptions): Promise<string> {
    try {
      const adapter = getLLMAdapter();
      return await adapter.generateText(prompt, options);
    } catch (primaryErr: any) {
      console.warn(`⚠️ Primary LLM provider failed: ${primaryErr.message}. Attempting fallbacks...`);

      const fallbackChain = [];
      if (process.env.DEEPSEEK_API_KEY) {
        fallbackChain.push({ name: "DeepSeek", adapter: new DeepSeekLLMAdapter() });
      }
      if (process.env.OPENAI_API_KEY) {
        fallbackChain.push({ name: "OpenAI", adapter: new OpenAILLMAdapter() });
      }
      if (process.env.GEMINI_API_KEY) {
        fallbackChain.push({ name: "Gemini", adapter: new GeminiLLMAdapter() });
      }

      for (const fallback of fallbackChain) {
        try {
          console.log(`🤖 Attempting fallback LLM provider: ${fallback.name}`);
          return await fallback.adapter.generateText(prompt, options);
        } catch (fallbackErr: any) {
          console.warn(`⚠️ Fallback ${fallback.name} failed: ${fallbackErr.message}`);
        }
      }

      // If all fallbacks failed, propagate the original error
      throw primaryErr;
    }
  }
}

export const aiService = new AIService();
