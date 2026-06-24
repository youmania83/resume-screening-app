// src/lib/guardrails.ts

const INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous\s+)?instructions/i,
  /ignore\s+(?:all\s+)?(?:previous\s+)?rules/i,
  /bypass\s+(?:all\s+)?restrictions/i,
  /forget\s+(?:all\s+)?(?:previous\s+)?instructions/i,
  /forget\s+everything/i,
  /system\s+prompt/i,
  /you\s+must\s+return/i,
  /override\s+score/i,
  /instead\s+of\s+the\s+job/i,
  /assistant\s+must\s+output/i,
  /you\s+are\s+now\s+a/i,
  /act\s+as\s+a/i,
  /do\s+not\s+evaluate/i,
  /ignore\s+the\s+above/i,
  /ignore\s+the\s+below/i,
  /ignore\s+this/i,
  /stop\s+parsing/i,
];

/**
 * Sanitizes input text, removing null characters and trimming whitespace.
 */
export function sanitizeInput(text: string): string {
  if (!text) return "";
  return text.trim().replace(/\0/g, "");
}

/**
 * Scans a string for prompt injection pattern matching.
 * Returns true if a potential injection attempt is detected.
 */
export function detectPromptInjection(text: string): boolean {
  if (!text) return false;
  
  const sanitized = sanitizeInput(text);
  
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      return true;
    }
  }
  
  return false;
}
