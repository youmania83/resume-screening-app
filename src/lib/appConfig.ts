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
    console.warn(`⚠️  [Config] INGESTION_CUTOFF_DATE="${raw}" is not a valid date. Falling back to start of today.`);
  }
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return todayStart;
}

/** ISO string form of the cutoff, for use as a SQL bind parameter. */
export function getIngestionCutoffIso(): string {
  return getIngestionCutoff().toISOString();
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
