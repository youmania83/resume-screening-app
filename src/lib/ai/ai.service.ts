import { getLLMAdapter } from "./adapters/index.js";
import { LLMOptions, LLMAdapter } from "./adapters/LLMAdapter.js";
import { DeepSeekLLMAdapter } from "./adapters/DeepSeekLLMAdapter.js";
import { OpenAILLMAdapter } from "./adapters/OpenAILLMAdapter.js";
import { GeminiLLMAdapter } from "./adapters/GeminiLLMAdapter.js";
import { CircuitBreaker, retryWithBackoff } from "../circuitBreaker.js";

// Reusable circuit breakers per provider
const breakers: Record<string, CircuitBreaker<string>> = {
  DeepSeek: new CircuitBreaker("DeepSeek-LLM", {
    failureThreshold: 3,
    recoveryTimeoutMs: 30000,
    requestTimeoutMs: 15000, // 15s timeout
    maxConcurrentRequests: 5
  }),
  OpenAI: new CircuitBreaker("OpenAI-LLM", {
    failureThreshold: 3,
    recoveryTimeoutMs: 30000,
    requestTimeoutMs: 15000,
    maxConcurrentRequests: 5
  }),
  Gemini: new CircuitBreaker("Gemini-LLM", {
    failureThreshold: 3,
    recoveryTimeoutMs: 30000,
    requestTimeoutMs: 15000,
    maxConcurrentRequests: 5
  })
};

function getProviderName(adapter: LLMAdapter): string {
  if (adapter instanceof DeepSeekLLMAdapter) return "DeepSeek";
  if (adapter instanceof OpenAILLMAdapter) return "OpenAI";
  if (adapter instanceof GeminiLLMAdapter) return "Gemini";
  return "Unknown";
}

export class AIService {
  /**
   * General text generation method routing to the active model provider.
   * If the primary configured provider fails, falls back sequentially to others.
   */
  async generateText(prompt: string, options?: LLMOptions): Promise<string> {
    const adapter = getLLMAdapter();
    const providerName = getProviderName(adapter);
    const breaker = breakers[providerName] || new CircuitBreaker(providerName, {
      failureThreshold: 3,
      recoveryTimeoutMs: 30000,
      requestTimeoutMs: 15000
    });

    try {
      return await breaker.execute(
        () => retryWithBackoff(() => adapter.generateText(prompt, options), 2, 1000, 2)
      );
    } catch (primaryErr: any) {
      console.warn(`⚠️ Primary LLM provider (${providerName}) failed: ${primaryErr.message}. Attempting fallbacks...`);

      const fallbackChain = [];
      if (process.env.DEEPSEEK_API_KEY && providerName !== "DeepSeek") {
        fallbackChain.push({ name: "DeepSeek", adapter: new DeepSeekLLMAdapter() });
      }
      if (process.env.OPENAI_API_KEY && providerName !== "OpenAI") {
        fallbackChain.push({ name: "OpenAI", adapter: new OpenAILLMAdapter() });
      }
      if (process.env.GEMINI_API_KEY && providerName !== "Gemini") {
        fallbackChain.push({ name: "Gemini", adapter: new GeminiLLMAdapter() });
      }

      for (const fallback of fallbackChain) {
        try {
          console.log(`🤖 Attempting fallback LLM provider: ${fallback.name}`);
          const fallbackBreaker = breakers[fallback.name] || new CircuitBreaker(fallback.name, {
            failureThreshold: 3,
            recoveryTimeoutMs: 30000,
            requestTimeoutMs: 15000
          });

          return await fallbackBreaker.execute(
            () => retryWithBackoff(() => fallback.adapter.generateText(prompt, options), 2, 1000, 2)
          );
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
