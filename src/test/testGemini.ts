// src/test/testGemini.ts
import { GeminiLLMAdapter } from "../lib/ai/adapters/GeminiLLMAdapter.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function main() {
  const apiKey = process.env.GEMINI_API_KEY || process.argv[2];
  if (!apiKey) {
    console.error("❌ Error: GEMINI_API_KEY not found in .env and not passed as command argument.");
    console.log("Usage: npx tsx src/test/testGemini.ts [YOUR_GEMINI_API_KEY]");
    process.exit(1);
  }

  // Set the key in environment for the adapter
  process.env.GEMINI_API_KEY = apiKey;

  console.log("🚀 Initializing Gemini LLM Adapter...");
  const adapter = new GeminiLLMAdapter();

  const prompt = "Say 'Hello, Gemini API is working!' and explain briefly what the temperature is in LLMs in 1 sentence.";
  console.log(`\n💬 Prompt: "${prompt}"`);
  console.log("⏳ Sending request to Gemini (gemini-2.5-flash)...");

  try {
    const startTime = Date.now();
    const response = await adapter.generateText(prompt, { temperature: 0.7 });
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n✅ Response received in ${duration}s:`);
    console.log("-----------------------------------------");
    console.log(response);
    console.log("-----------------------------------------");
  } catch (error: any) {
    console.error("\n❌ Gemini API request failed:");
    console.error(error.message || error);
  }
}

main();
