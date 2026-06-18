export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface LLMAdapter {
  generateText(prompt: string, options?: LLMOptions): Promise<string>;
}
