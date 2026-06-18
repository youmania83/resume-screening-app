import { getLLMAdapter } from "./adapters/index.js";
import { LLMOptions } from "./adapters/LLMAdapter.js";

export class AIService {
  /**
   * General text generation method routing to the active model provider.
   */
  async generateText(prompt: string, options?: LLMOptions): Promise<string> {
    const adapter = getLLMAdapter();
    return adapter.generateText(prompt, options);
  }
}

export const aiService = new AIService();
