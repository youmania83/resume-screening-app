import { aiService } from "./ai/ai.service.js";
import { LLMOptions } from "./ai/adapters/LLMAdapter.js";

/**
 * Sends a prompt to the active configured LLM provider and returns the response content.
 * Retains the original function name for backwards compatibility across the application.
 */
export async function callDeepSeek(prompt: string, options?: LLMOptions): Promise<string> {
  return aiService.generateText(prompt, options);
}
