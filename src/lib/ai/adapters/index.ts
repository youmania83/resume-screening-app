import { LLMAdapter } from "./LLMAdapter.js";
import { DeepSeekLLMAdapter } from "./DeepSeekLLMAdapter.js";
import { OpenAILLMAdapter } from "./OpenAILLMAdapter.js";
import { GeminiLLMAdapter } from "./GeminiLLMAdapter.js";

export * from "./LLMAdapter.js";
export * from "./DeepSeekLLMAdapter.js";
export * from "./OpenAILLMAdapter.js";
export * from "./GeminiLLMAdapter.js";

/**
 * Factory resolver that returns the active LLMAdapter based on AI_PROVIDER environment variable
 * or automatic fallback to available API keys.
 */
export function getLLMAdapter(): LLMAdapter {
  const provider = (process.env.AI_PROVIDER || "").toLowerCase().trim();

  // Explicit provider routing
  if (provider === "deepseek") {
    return new DeepSeekLLMAdapter();
  }
  if (provider === "openai") {
    return new OpenAILLMAdapter();
  }
  if (provider === "gemini") {
    return new GeminiLLMAdapter();
  }

  // Automatic fallback based on key existence
  if (process.env.DEEPSEEK_API_KEY) {
    console.log("🤖 Auto-resolved active AI provider to DeepSeek (DEEPSEEK_API_KEY detected)");
    return new DeepSeekLLMAdapter();
  }
  if (process.env.OPENAI_API_KEY) {
    console.log("🤖 Auto-resolved active AI provider to OpenAI (OPENAI_API_KEY detected)");
    return new OpenAILLMAdapter();
  }
  if (process.env.GEMINI_API_KEY) {
    console.log("🤖 Auto-resolved active AI provider to Google Gemini (GEMINI_API_KEY detected)");
    return new GeminiLLMAdapter();
  }

  // Default fallback if nothing is configured (will throw key missing error on invoke)
  console.warn("⚠️ No active AI_PROVIDER or LLM API keys detected. Defaulting to DeepSeek adapter.");
  return new DeepSeekLLMAdapter();
}
