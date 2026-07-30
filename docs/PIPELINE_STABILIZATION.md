# Recruitment Pipeline Stabilization — 2026-07-30

Stabilization pass over the end-to-end recruitment workflow. No new features; every
change fixes a defect that was live in production.

**Status:** TypeScript clean (including `src/worker`, which the tsconfig previously
excluded from type checking), ESLint clean (0 errors), 29/29 regression checks pass
via `npx tsx src/test/verifyPipelineFixes.ts`.

---

## Critical bugs fixed

### 1. Candidates were being invented out of thin air
`ResumeParserProvider.ts` appended `MockParser` as an unconditional last-resort
fallback. Whenever every AI provider failed (rate limit, outage, bad key), it
returned a **fully fabricated profile**: `john.doe@example.com`, "John Doe",
5 years of experience, a fixed skill list, and hard-coded scores of 80/85/75/90/95.

A score of 80 is the shortlist threshold, so these phantom candidates were
auto-shortlisted, issued assessment tokens, and mailed real assessment invitations.

**Fix:** the mock parser is now opt-in only (`ALLOW_MOCK_PARSER=true`). If every AI
provider fails, `parse()` throws — the inbox item is marked retryable and re-processed
on the next cycle. Added per-provider retry with backoff and a validation pass that
normalises/bounds every AI field and refuses structurally implausible responses.

Two more fabrication sites in `zohoMail.service.ts`:
- Applications with no resume attachment had a **fake PDF written for them**
  (`"Experience: 3 years. General skills."`) purely so the parser would run. The AI
  then extracted those invented details and scored the candidate on them. Now the
  application is recorded and flagged for HR follow-up; no resume is synthesised.
- New candidates were inserted with a hard-coded score of `60` — exactly the
  HR-review threshold — so they looked pre-qualified before any AI evaluation.
  Now `0`, with the real score written by the screening worker.

### 2. Assessment links in emails were dead
`NEXT_PUBLIC_APP_URL` was never set in `.env`, and `email.ts` fell back to
`https://api.risonaitech.com` — the **API** host. `/assessment/[token]` is a Next.js
front-end route, so every invitation contained a 404 link. Every other file in the
repo fell back to `http://localhost:3000` instead, so the fallbacks disagreed.

**Fix:** `NEXT_PUBLIC_APP_URL` is now set and documented, link building is centralised
in `src/lib/appConfig.ts`, and the server logs the resolved URL at boot plus a loud
warning if it is unset.

### 3. Assessment invitations were re-sent every 30 minutes
`sendAssessmentInviteEmail` never called `recordEmailLog`. The autonomous cycle's
duplicate check reads `email_logs`, found nothing, and re-selected every candidate
whose `assessment_status` was still `'pending'` — so shortlisted candidates received
a fresh invitation on **every 30-minute cycle** until they completed the assessment.

**Fix:** three layers.
- New `candidates.assessment_invited_at` column as an exactly-once marker; the
  dispatch query requires it to be NULL. Backfilled in `initDb` from `email_logs` /
  activity logs so existing candidates are not re-mailed.
- Every lifecycle sender now records to `email_logs` on both success and failure,
  and self-guards via `canSendEmailToCandidate` regardless of call site.
- Rewrote the email policy: stage emails are **once per candidate, ever**; reminders
  are repeatable with a cooldown. Only `delivery_status = 'sent'` rows count, so a
  genuine failure is still retried.

### 4. The 5-email lifetime cap silently dropped late-stage emails
The old guard blocked *all* email after 5 sends to an address, counted by
`recipient OR candidate_id`. Once logging was fixed, this would have swallowed
interview-schedule and offer emails for anyone who had received earlier stages, and
leaked dedup state between candidates sharing a mailbox.

**Fix:** replaced with per-template idempotency plus generous rate ceilings
(6/day, 25 lifetime, both configurable) as pure safety nets. Identity matching now
prefers `candidate_id` when available.

### 5. HR review was being bypassed
`/assessment/submit` marks both the 80%+ band ("Qualified") and the 60–79% band
("Review") as `assessment_status = 'passed'`. The autonomous cycle keyed off
`assessment_status = 'passed'` alone, so it auto-scheduled interviews for the 60–79%
band too — bypassing the human review step entirely.

**Fix:** auto-advance is gated on `final_score >= PIPELINE_THRESHOLDS.INTERVIEW`.
`assessment_status` stays `'passed'` for both bands so existing dashboard counters
remain correct.

### 6. Candidates were mailed invented scores
The cycle sent interview emails with `assessment_score || 85` and
`final_score || 83` — so a missing value became a plausible-looking fake number in
a candidate-facing email. Now uses real values only, and the query requires
`final_score IS NOT NULL`.

### 7. Closed and removed job openings still attracted applicants
Nothing filtered on job state during matching. `resumeWorker`, the autonomous cycle,
`EmailSyncService`, `zohoMail.service` and `candidateRouter` all matched against
**every** job row, including requisitions the ATS had marked `removed`.

**Fix:** new `jobs.status` column (default `'active'`) plus a single shared predicate
`ACTIVE_JOB_SQL` applied at every matching site. `DELETE /api/jobs/:id` now
**soft-closes** instead of hard-deleting — the hard delete cascaded through
`candidate_job_matches` and nulled `candidates.job_id`, destroying the application
history of everyone who had applied.

Also removed the "fall back to the first available job" rule in the Zoho sync, which
assigned unmatched applications to whichever requisition happened to sort first.

### 8. `job_id = "default-job"` foreign-key failures
The dispatch loop substituted the literal string `"default-job"` for a NULL
`job_id`, so `ensureJobAssessment` failed on a foreign key and those candidates never
got an assessment. The query now requires a real, open job via an inner join.

### 9. Multi-tenant data leaks
- The role-remapping loop iterated over **all tenants'** jobs, so a candidate from
  tenant A could be assigned tenant B's requisition. Now filtered per tenant.
- The Zoho OAuth sync inserted candidates, documents, applications and logs with
  **NULL `tenant_id`** — the records existed in the database but were invisible to
  every tenant-scoped dashboard query. Now resolves and sets a tenant
  (`ZOHO_SYNC_TENANT_ID` to route explicitly when several tenants exist).
- The public assessment-registration fallback resolved a job across all tenants.

### 10. The heuristic remapper was overwriting AI scores
The cycle ran `score = GREATEST(score, heuristic)` on every candidate, every 30
minutes. Since the heuristic only ratchets upward, candidates could cross the 80%
shortlist threshold on crude keyword matching with **no AI evaluation at all**.
Now only `match_percent` is written; `score` (the AI resume score) is never touched.

### 11. Interviews were booked on weekends, and could double-book
A flat "+2 calendar days" regularly landed on Saturday or Sunday.
`ON CONFLICT (id) DO NOTHING` against a freshly generated UUID is a no-op, so it
provided no protection.

**Fix:** `nextBusinessDaySlot()` skips weekends; a partial unique index
(`uniq_interviews_active_candidate`) makes double-booking impossible even under a
cron race; conditional inserts turn the race into a no-op; the submit path reuses an
existing booking instead of creating a second one. `interviews.tenant_id` was also
missing on the submit path (the cycle set it), producing tenant-less rows.
The iCalendar UID is now stable, so a reschedule updates the existing calendar entry
instead of adding a duplicate.

### 12. Unroutable HR placeholder address
`hrEmail` defaulted to `yogeshkumarwadhwa@localhost.com`, so every HR notification
attempted delivery to an invalid domain and logged an SMTP error. Now resolves
tenant config → tenant owner → `HR_NOTIFICATION_EMAIL`, and skips the HR copy when
none is configured. An HR-copy failure no longer marks the candidate delivery as
failed (which would have triggered a re-send).

### 13. Storage pruning could have wiped every resume
`pruneOrphanedFiles` deleted any file whose URL was absent from the database. If the
reference query returned zero rows for any reason, **every file in storage** became
an "orphan". There was also no grace period, so a resume written to storage moments
before its `resume_inbox` row committed looked unreferenced.

**Fix:** aborts if the reference set is empty; aborts if more than 50% of files look
orphaned (that indicates a key/URL mismatch, not real orphans); 48-hour grace period
on unreferenced files. All configurable.

### 14. Historical data was being rewritten every 30 minutes
The cycle ran `SELECT ... FROM candidates` with no bounds — re-scoring, re-mapping
roles and re-triggering stage emails across the entire table on every run.
Every bulk operation is now scoped to `INGESTION_CUTOFF_DATE`.

### 15. A dead worker was competing for the live queue
`parseWorker.ts` consumed the **same** BullMQ queue as `resumeWorker.ts` but only
extracts text — it creates no candidate, no score, no invitation. Since BullMQ
delivers each job to exactly one consumer, running both meant roughly half of all
incoming resumes were silently swallowed. It also had a broken `pdf-parse` import,
which is why `src/worker` being excluded from type checking mattered.

**Fix:** opt-in via `ENABLE_LEGACY_PARSE_WORKER`, bound to its own queue name, and
the import fixed.

### 16. Ingestion cutoff hardening
The IMAP path used a rolling "midnight today" boundary — an application arriving at
23:55 that hit a transient sync error was skipped **forever** once the clock passed
midnight. Emails with no date header were processed unconditionally.
The Zoho OAuth path had no cutoff at all, so the two ingestion routes disagreed.

**Fix:** a pinned `INGESTION_CUTOFF_DATE` (falling back to start-of-today), enforced
identically on both paths; undated/unparseable-date mail is skipped explicitly.

### 17. Three compile errors were being shipped
`email.ts` had three `string | null` type errors, masked by
`typescript.ignoreBuildErrors: true` in `next.config.js`. Fixed the nullable
recipient handling and removed the ignore flag, along with the `eslint` key that
Next 16 no longer supports (it warned on every build).

---

## Data retention

Per your requirement — records from the cutoff forward are kept **permanently**:

- No cron job deletes candidate records. Verified across the whole codebase.
- `resetPreJuly29Data.ts` (the one-off go-live cleanup) now refuses to run without
  **both** `CONFIRM_DESTRUCTIVE_ACTION=YES` and `--confirm`.
- `cleanRejectedCandidates.ts` is deprecated and likewise gated.
- **New:** `src/scripts/purgeRejectedCandidates.ts` — the approval-gated weekly
  purge of rejected candidates only:
  ```bash
  # Dry run: reports what would be deleted, deletes nothing
  npx tsx src/scripts/purgeRejectedCandidates.ts

  # Approved run
  CONFIRM_DESTRUCTIVE_ACTION=YES npx tsx src/scripts/purgeRejectedCandidates.ts --confirm

  # Options: --days=N (retention window, default 7), --tenant=<id>
  ```
  Only candidates rejected at least 7 days ago are eligible. Dry-run by default,
  writes an audit manifest to `logs/` on every run, and preserves the `resume_inbox`
  ingestion audit trail (detaches rather than deletes).

  Deliberately **not** wired to cron — "weekly with approval" means a human runs it.

---

## To activate

1. **Run the migration** — adds `jobs.status`, `candidates.assessment_invited_at`,
   the interview uniqueness index and the dedup indexes, and backfills the invite
   marker so your existing pipeline is not re-mailed:
   ```bash
   npm run init-db
   ```
   If it warns that `uniq_interviews_active_candidate` could not be created, you
   have pre-existing duplicate live interviews — resolve those and re-run.

2. **Confirm `NEXT_PUBLIC_APP_URL`** in `.env` is the real front-end host. It is
   currently set to `https://app.risonaitech.com`. This must be a URL where
   `/assessment/<token>` actually renders, or invitations will still be dead links.

3. **Restart the API and worker** so the new cron logic and boot checks take effect.
   Watch for these lines:
   ```
   🔗 [Config] Candidate-facing links will be built from: https://...
   🗓️  [Config] Ingestion cutoff: 2026-07-30T...
   🧠 [Config] AI resume parsing providers (in failover order): DeepSeek → Gemini
   ```
   If you instead see `🛑 [Config] No AI resume-parsing provider is configured`,
   resumes will queue and retry rather than be screened — no fake data, but nothing
   progresses until a key is set.

4. **Send one test application** end to end and confirm: candidate created with a
   real AI score → shortlisted (if ≥80) → exactly one invitation email with a
   working link → assessment completes → interview scheduled on a weekday → exactly
   one interview email with a calendar attachment.

---

## Verification

```bash
npx tsc --noEmit                              # type check (0 errors)
npm run lint                                  # 0 errors
npx tsx src/test/verifyPipelineFixes.ts       # 29 regression checks
```

The regression harness needs no database and performs no writes — safe to run any
time. Each test maps to one of the defects above, so a failure means a regression.

### Not verified here

- `next build` could not be completed in my Linux sandbox: `node_modules` was
  installed on macOS, so the platform-specific `@next/swc` and `esbuild` binaries
  are missing and the npm registry is unreachable from the sandbox. Please run
  `npm run build` locally. Note that removing `typescript.ignoreBuildErrors` means
  the build will now fail on type errors rather than shipping them — that is
  intended, and `tsc --noEmit` is currently clean.
- Database-backed behaviour (the `email_logs` dedup queries, the migration SQL)
  is reviewed but not executed, since the only reachable database is production and
  I did not want to write to it. `npm run init-db` is idempotent
  (`ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`) and the backfill is
  wrapped in a non-fatal catch.

---

## Known issues left alone

- **`sendAssessmentResultDetailsEmail` mails candidates a full question-by-question
  breakdown including the correct answers.** That is a cheating vector — a candidate
  can forward the answer key to the next applicant. It looks intentional, so I did
  not change the behaviour, but you may want the candidate copy to show only their
  score and the HR copy to carry the breakdown.
- `calculateHeuristicMatch` scores resumes against jobs using keyword overlap, not
  AI, even though the AI parser returns `skillsScore` / `experienceScore` /
  `industryScore` / `educationScore` / `locationScore`. Wiring the match score to
  the AI sub-scores would make "scored accurately using AI" true in the strong
  sense. This is a behaviour change rather than a bug fix, so I left it — worth
  discussing.
- `app/candidate/portal/[token]/page.tsx:348` uses `<img>` rather than
  `next/image` (one ESLint warning, cosmetic).
