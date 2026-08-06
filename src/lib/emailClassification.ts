// src/lib/emailClassification.ts
//
// Shared "is this actually a job application email?" heuristic, used by every inbound
// mail ingestion path (IMAP sync, Zoho OAuth sync) so they agree on what counts as an
// application rather than each path inventing its own rule.
//
// Previously only the IMAP path (EmailSyncService) classified inbound mail before
// treating it as an application. The Zoho OAuth sync path — the primary, preferred
// ingestion channel whenever OAuth credentials are configured — had no classification
// step at all: any unread message in the mailbox (newsletter, vendor invoice,
// out-of-office reply, internal note) became a candidate record as long as it was
// unread and arrived after the ingestion cutoff.

/** Same default subject-line pattern EmailSyncService.ts has always used for the
 *  "resume" classification (job-description classification is intentionally excluded
 *  here — inbound job-description ingestion is IMAP-only). */
const DEFAULT_APPLICATION_SUBJECT_REGEX = /applying\s*for|job\s*application|resume\s*for|cv\s*for/i;

/** Filename keywords that indicate an attachment is plausibly a resume, used as a
 *  fallback when the subject line itself doesn't clearly say "this is an application". */
const RESUME_FILENAME_KEYWORDS = [
  "resume", "cv", "curriculum", "biodata", "profile", "portfolio", "candidate", "application",
];

/**
 * Returns true when an inbound email is plausibly a job application, based on the
 * subject line matching an application-intent pattern, OR (when the subject doesn't
 * match) at least one attachment filename containing a resume-related keyword.
 *
 * Deliberately conservative: an email with neither a matching subject nor a
 * resume-named attachment is not treated as an application, so spam/newsletters/
 * internal mail landing unread in the sync mailbox does not create a candidate record.
 */
export function isLikelyApplicationEmail(
  subject: string | null | undefined,
  attachmentFilenames: (string | null | undefined)[],
  subjectRegex: RegExp = DEFAULT_APPLICATION_SUBJECT_REGEX
): boolean {
  const subjectText = subject || "";
  if (subjectRegex.test(subjectText)) {
    return true;
  }

  return attachmentFilenames.some(name => {
    const lower = (name || "").toLowerCase();
    return lower.length > 0 && RESUME_FILENAME_KEYWORDS.some(kw => lower.includes(kw));
  });
}
