// src/lib/appConfig.ts
//
// Single source of truth for cross-cutting recruitment-pipeline configuration.
// Previously these values were duplicated (with *different* fallbacks) across
// email.ts, server.ts, authRouter.ts, security.ts and the workers, which caused
// broken candidate-facing links and inconsistent job filtering.

import dotenv from "dotenv";
dotenv.config();

/* ────────────────────────────────────────────────────────────────────────────
 * 1. Public application URL (the Next.js front-end that serves /assessment/*)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Base URL of the candidate-facing web app.
 *
 * IMPORTANT: this must point at the *front-end* host (e.g. https://app.example.com),
 * NOT the API host. The assessment portal (`/assessment/[token]`) and candidate
 * portal (`/candidate/portal/[token]`) are Next.js routes — pointing them at the
 * Express API host produces dead links in candidate emails.
 */
export function getAppUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.FRONTEND_URL ||
    "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/** Absolute, ready-to-click assessment link for a candidate token. */
export function buildAssessmentLink(token: string): string {
  return `${getAppUrl()}/assessment/${token}`;
}

/** Absolute candidate self-service portal link. */
export function buildCandidatePortalLink(token: string): string {
  return `${getAppUrl()}/candidate/portal/${token}`;
}

/**
 * Warn loudly at boot if the app URL was never configured, because the failure
 * mode (candidates receiving links to localhost / the API host) is silent.
 */
export function assertAppUrlConfigured(): void {
  if (!process.env.NEXT_PUBLIC_APP_URL && !process.env.APP_URL && !process.env.FRONTEND_URL) {
    console.warn(
      "⚠️  [Config] NEXT_PUBLIC_APP_URL is not set. Candidate assessment links will " +
        `fall back to "${getAppUrl()}" and will not work in production. ` +
        "Set NEXT_PUBLIC_APP_URL to the public front-end URL (e.g. https://app.risonaitech.com)."
    );
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * 2. Active job openings
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * SQL predicate that identifies an *active* job opening.
 *
 * A job counts as active unless it has been explicitly closed by HR
 * (`jobs.status`) or removed upstream by an ATS sync (`jobs.sync_status`).
 *
 * Use as: `SELECT ... FROM jobs WHERE tenant_id = $1 AND ${ACTIVE_JOB_SQL}`
 * (the fragment contains no bind parameters, so it is safe to interpolate).
 */
export const ACTIVE_JOB_SQL = `(COALESCE(status, 'active') = 'active' AND sync_status IS DISTINCT FROM 'removed')`;

/** Same predicate, qualified with a table alias (e.g. `j`). */
export function activeJobSql(alias: string): string {
  return `(COALESCE(${alias}.status, 'active') = 'active' AND ${alias}.sync_status IS DISTINCT FROM 'removed')`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 3. Ingestion cutoff — "process only resumes received from today onwards"
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Only applications received at/after this instant are ingested and screened.
 *
 * Configure `INGESTION_CUTOFF_DATE` (an ISO date, e.g. `2026-07-30`) to pin the
 * cutoff to a fixed go-live date. A fixed date is strongly preferred over a
 * rolling "midnight today" boundary: with a rolling boundary, an application
 * that arrives at 23:55 and fails a transient sync is skipped forever once the
 * clock passes midnight.
 *
 * If unset, falls back to the start of the current local day.
 */
export function getIngestionCutoff(): Date {
  const raw = process.env.INGESTION_CUTOFF_DATE;
  if (raw && raw.trim()) {
    const parsed = new Date(raw.trim());
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
    console.warn(`⚠️  [Config] INGESTION_CUTOFF_DATE="${raw}" is not a valid date. Falling back to 24h grace cutoff.`);
  }
  const graceCutoff = new Date();
  graceCutoff.setDate(graceCutoff.getDate() - 1);
  graceCutoff.setHours(0, 0, 0, 0);
  return graceCutoff;
}

/** ISO string form of the cutoff, for use as a SQL bind parameter. */
export function getIngestionCutoffIso(): string {
  return getIngestionCutoff().toISOString();
}

/**
 * Only applicants whose application arrived at/after this instant receive the
 * "Application Received" acknowledgement email.
 *
 * Deliberately a *separate* cutoff from `INGESTION_CUTOFF_DATE`: that one pins the
 * date processing/screening went live, which is normally in the past by the time this
 * acknowledgement requirement is turned on. Reusing it would acknowledge every
 * applicant who arrived between the two go-live dates, not just "from now onwards."
 *
 * Configure `ACKNOWLEDGEMENT_CUTOFF_DATE` (an ISO date) to pin it to a fixed instant.
 * If unset, falls back to the start of the current local day — same rationale as
 * `getIngestionCutoff()`: a fixed date avoids a rolling boundary silently changing
 * which applicants qualify as the clock crosses midnight.
 */
export function getAcknowledgementCutoff(): Date {
  const raw = process.env.ACKNOWLEDGEMENT_CUTOFF_DATE;
  if (raw && raw.trim()) {
    const parsed = new Date(raw.trim());
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
    console.warn(`⚠️  [Config] ACKNOWLEDGEMENT_CUTOFF_DATE="${raw}" is not a valid date. Falling back to start of today.`);
  }
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return todayStart;
}

/** ISO string form of the acknowledgement cutoff, for use as a SQL bind parameter. */
export function getAcknowledgementCutoffIso(): string {
  return getAcknowledgementCutoff().toISOString();
}

/* ────────────────────────────────────────────────────────────────────────────
 * 4. HR notification recipient
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Fallback HR recipient for internal notifications.
 *
 * Callers should first try the tenant's configured `email_config.hrManagerEmail`
 * and then the tenant owner; this is the last resort. It returns null rather
 * than a placeholder address so that we never attempt delivery to an
 * unroutable domain (the previous hard-coded `@localhost.com` fallback caused
 * every interview notification to log an SMTP error).
 */
export function getFallbackHrEmail(): string | null {
  const raw = process.env.HR_NOTIFICATION_EMAIL || process.env.SMTP_FROM_ADDRESS || "";
  const trimmed = raw.trim();
  if (!trimmed || !trimmed.includes("@")) return null;
  return trimmed;
}

/** Whether internal HR copies of candidate emails are enabled. */
export function hrNotificationsEnabled(): boolean {
  return process.env.ENABLE_HR_EMAIL_NOTIFICATIONS === "true";
}

/* ────────────────────────────────────────────────────────────────────────────
 * 5. Pipeline thresholds (kept in one place so every stage agrees)
 * ──────────────────────────────────────────────────────────────────────────── */

export const PIPELINE_THRESHOLDS = {
  /** Resume match score at/above which a candidate is shortlisted for assessment. */
  SHORTLIST: numFromEnv("PIPELINE_SHORTLIST_THRESHOLD", 80),
  /** Resume match score at/above which a candidate is held for HR review. */
  REVIEW: numFromEnv("PIPELINE_REVIEW_THRESHOLD", 60),
  /** Minimum job-match score required before a candidate is linked to a job. */
  JOB_MATCH_FLOOR: numFromEnv("PIPELINE_JOB_MATCH_FLOOR", 50),
  /** Final (resume 40% + assessment 60%) score at/above which we auto-advance to interview. */
  INTERVIEW: numFromEnv("PIPELINE_INTERVIEW_THRESHOLD", 80),
} as const;

function numFromEnv(key: string, fallback: number): number {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 5a. Job mapping strictness
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * When true (the default), an applicant is only ever attached to the specific
 * active opening they actually applied for — as identified from the application
 * email (subject line, job code, or ATS job reference).
 *
 * If the target job cannot be determined, the candidate is routed to HR Review
 * *unmapped* rather than being auto-assigned to the "best matching" opening.
 *
 * The previous best-match behaviour is what put applicants under roles they never
 * applied for, and — combined with the periodic re-matching pass — moved the same
 * person between several different roles over time.
 */
export function isStrictJobMapping(): boolean {
  return process.env.STRICT_JOB_MAPPING !== "false";
}

/* ────────────────────────────────────────────────────────────────────────────
 * 5b. Assessment lifecycle
 * ──────────────────────────────────────────────────────────────────────────── */

/** How long an assessment invitation stays valid, in days. */
export const ASSESSMENT_VALIDITY_DAYS = numFromEnv("ASSESSMENT_VALIDITY_DAYS", 7);

/**
 * Day(s) after the invitation on which a reminder is sent, if the assessment is
 * still incomplete. Day 1 is the day the invitation went out.
 *
 * Default [3, 4] gives the candidate a nudge mid-window while still leaving
 * several days to complete. Exactly one reminder is sent per candidate: the
 * first matching day wins, and the email guard prevents a second.
 */
export const ASSESSMENT_REMINDER_DAYS: number[] = (() => {
  const raw = process.env.ASSESSMENT_REMINDER_DAYS;
  if (raw && raw.trim()) {
    const parsed = raw
      .split(",")
      .map(v => Number(v.trim()))
      .filter(v => Number.isFinite(v) && v >= 1);
    if (parsed.length > 0) return parsed;
  }
  return [3, 4];
})();

/**
 * Whole days elapsed since the invitation was sent, where the send day is day 1.
 */
export function daysSinceInvite(invitedAt: Date | string): number {
  const sent = new Date(invitedAt);
  if (isNaN(sent.getTime())) return 0;

  const startOfSendDay = new Date(sent);
  startOfSendDay.setHours(0, 0, 0, 0);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const dayDiff = Math.round((startOfToday.getTime() - startOfSendDay.getTime()) / 86400000);
  return dayDiff + 1; // send day counts as day 1
}

/* ────────────────────────────────────────────────────────────────────────────
 * 6. Business-day interview scheduling
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Returns the next interview slot: `businessDaysAhead` working days from now at
 * `hour` local time, skipping Saturdays and Sundays.
 *
 * The previous implementation added a flat 2 calendar days, which regularly
 * scheduled interviews on Saturday or Sunday.
 */
export function nextBusinessDaySlot(businessDaysAhead = 2, hour = 10): Date {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);

  let remaining = Math.max(1, businessDaysAhead);
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay(); // 0 = Sunday, 6 = Saturday
    if (day !== 0 && day !== 6) {
      remaining--;
    }
  }
  return date;
}
