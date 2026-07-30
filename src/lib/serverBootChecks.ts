// src/lib/serverBootChecks.ts
//
// Startup configuration checks. Each of these guards a setting whose failure mode
// is silent — the system keeps running but produces wrong results (dead candidate
// links, fabricated candidate profiles), which is exactly the class of defect that
// is hardest to notice in production.

import { ResumeParserManager } from "./parser/ResumeParserProvider.js";

export { assertAppUrlConfigured, getAppUrl, getIngestionCutoffIso } from "./appConfig.js";

/**
 * Verifies the AI parsing setup at boot.
 *
 * - Warns hard if the fabricating MockParser is enabled.
 * - Warns if no AI provider key is configured at all (resumes will queue and
 *   retry rather than being parsed, which is the safe behaviour but needs to be
 *   visible to the operator).
 */
export function ResumeParserBootCheck(): void {
  if (ResumeParserManager.isMockParserEnabled()) {
    console.warn("🛑 [Config] ALLOW_MOCK_PARSER is enabled. Resumes may be populated with FABRICATED data if the AI providers fail. Disable this in production.");
  }

  const providers = ResumeParserManager.getProviders()
    .map(p => p.name)
    .filter(name => name !== "Mock");

  if (providers.length === 0) {
    console.error(
      "🛑 [Config] No AI resume-parsing provider is configured (DEEPSEEK_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY). " +
      "Resumes will remain queued and be retried; no candidates will be scored until a key is set."
    );
  } else {
    console.log(`🧠 [Config] AI resume parsing providers (in failover order): ${providers.join(" → ")}`);
  }
}
