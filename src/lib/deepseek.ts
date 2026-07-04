import { aiService } from "./ai/ai.service.js";
import { LLMOptions } from "./ai/adapters/LLMAdapter.js";

/**
 * Sends a prompt to the active configured LLM provider and returns the response content.
 * Retains the original function name for backwards compatibility across the application.
 */
export async function callDeepSeek(prompt: string, options?: LLMOptions): Promise<string> {
  const rawResponse = await aiService.generateText(prompt, options);
  
  // Clean reasoning thinking tags if present in the response content
  let cleaned = rawResponse.trim();
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  return cleaned;
}
