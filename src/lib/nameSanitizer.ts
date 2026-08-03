// src/lib/nameSanitizer.ts

/**
 * Sanitizes and infers a clean candidate name.
 * Prevents generic placeholders like "Unknown Candidate", "Name Not Found", or "Candidate".
 */
export function cleanCandidateName(rawName?: string, email?: string, rawText?: string): string {
  const junkRegex = /candidate name not found|name not found|not found|unknown candidate|unknown|candidate|n\/a|null|undefined/i;
  
  let name = (rawName || "").trim();

  // If rawName is missing, junk, or generic
  if (!name || junkRegex.test(name)) {
    // Attempt 1: Infer from resume header (first 3 non-empty lines)
    if (rawText && typeof rawText === "string") {
      const lines = rawText.split("\n").map(l => l.trim()).filter(l => l.length > 2 && !l.includes("@") && !/resume|curriculum|vitae|page|phone|mobile|email/i.test(l));
      for (const line of lines.slice(0, 3)) {
        // Name-like pattern: 2 to 4 capitalized words (e.g., "Pavan Kumar M", "Sayantan Chattopadhyay")
        if (/^[A-Z][a-zA-Z'.'-]{1,20}(?:\s+[A-Z][a-zA-Z'.'-]{1,20}){1,3}$/.test(line)) {
          console.log(`⚡ [Name Sanitizer] Extracted name from resume header: "${line}"`);
          return line;
        }
      }
    }

    // Attempt 2: Infer clean name from Email Address
    const cleanEmail = (email || "").trim().toLowerCase();
    if (cleanEmail && cleanEmail.includes("@")) {
      const prefix = cleanEmail.split("@")[0];
      // Replace dots, underscores, numbers, hyphens with space
      const nameParts = prefix
        .replace(/[0-9]/g, "")
        .split(/[._-]/)
        .filter(p => p.length > 1);

      if (nameParts.length > 0) {
        const formattedName = nameParts
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ");

        if (formattedName.length >= 3) {
          console.log(`⚡ [Name Sanitizer] Inferred clean candidate name from email "${cleanEmail}": "${formattedName}"`);
          return formattedName;
        }
      }
    }

    return "Candidate";
  }

  // Capitalize properly if all lowercase or all uppercase
  if (name === name.toLowerCase() || name === name.toUpperCase()) {
    name = name.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  }

  return name;
}
