# Go-Live Runbook — Clean Restart

Covers the six reported issues and the seven workflow requirements.

**Status:** TypeScript clean (app + worker), ESLint clean (0 errors), 39/39
regression checks pass.

---

## Part 1 — Why each reported issue happened

### "Same candidates processed multiple times under different job roles"

Two causes, both fixed.

1. **The resume worker created a second candidate row for every repeat
   application.** It detected the duplicate, then inserted a *new* row marked
   `status='duplicate'` anyway. Each of those rows was then independently
   job-matched, so one person accumulated several records under several roles.
   Repeat applications now **update the existing profile** and attach the new
   resume to it — one person, one record, one pipeline position.

2. **A periodic best-match sweep reassigned `job_id` every 30 minutes.** The
   autonomous cycle re-scored candidates against all openings and moved them to
   whichever scored highest, so the same person drifted between roles over
   successive cycles. This sweep is now **disabled** under strict job mapping.

### "Job roles that do not exist are being displayed"

Three endpoints manufactured job rows on demand:

- `POST /api/assessment/send` created a job from `candidate.role` — an AI-inferred
  free-text string — whenever the candidate had no `job_id`.
- `POST /api/assessment/generate` created a job from whatever title was posted,
  with a random UUID when `jobId` was omitted.
- `POST /api/evaluate` created a job when the title didn't match, falling back to
  the AI-inferred role and then to the hard-coded literal `"SCM Executive"`, with
  an invented department, location and experience range.

All three now **require an existing active opening** and return a clear error
otherwise. No code path creates a job from a candidate's role any more.

### "Already selected candidates appearing again under multiple roles"

The same best-match sweep. Its candidate query excluded `rejected`/`hired`/
`selected`, but the exclusion only applied to the status column — a candidate
whose status was `interviewing` or `shortlisted` was still eligible for
reassignment. With the sweep disabled, a candidate's job mapping is now set once
at intake and only changes when HR changes it.

### "Closed/inactive jobs are also getting processed"

Fixed in the previous pass (shared `ACTIVE_JOB_SQL` predicate) and extended here
to the remaining sites: the Keka re-screening query, the dashboard "active jobs"
tile, and the evaluate endpoint. Deleting a job now **soft-closes** it, so
candidate history survives while the opening stops accepting applicants.

### "AI Assessment issue — access prohibited"

Root cause: **`NEXT_PUBLIC_API_URL` was set to `http://localhost:4000/api`.**

Next.js inlines `NEXT_PUBLIC_*` variables into the browser bundle at **build**
time. Every candidate's browser was therefore trying to reach port 4000 *on their
own machine*. The request failed, and the error view rendered its generic
fallback: "Access Prohibited".

Three fixes:

1. `.env` now sets `NEXT_PUBLIC_API_URL=https://api.risonaitech.com/api`.
   **This only takes effect after a rebuild** — see step 3 below.
2. The error view now classifies failures properly. A connectivity failure reads
   "Can't Reach the Assessment Server", not a security warning.
3. The assessment entry endpoint was hardened (see below).

Also fixed while in there, each independently capable of breaking a candidate:

- **The token lookup could load the wrong candidate.** It fell back to matching on
  `candidate.id`, on `email ILIKE`, and on a *partial* token
  (`assessment_token ILIKE '%token%'`). Anyone with an email address or a token
  fragment could open someone else's assessment. Now an exact token match only.
- **Links never actually expired.** An "auto-heal" step pushed the expiry 30 days
  into the future on every page load, so the 7-day deadline in the invitation
  email was fiction. The real window is now enforced.
- **Candidates were mapped onto unrelated roles at test time.** A NULL `job_id`
  resolved to "the most recently created job in the tenant", then generated an
  assessment for that unrelated role.
- **Missing questions produced a blank test.** Now returns a clear "temporarily
  unavailable, try again shortly" instead of an empty assessment.

### "Talent Pool / Interviewing reflecting from Keka, causing mismatched data"

Keka was running a **second, competing state machine** against the same
`candidates` table:

- `autoRouteStage` used thresholds 60/75 where the pipeline uses 60/80 — so a
  candidate scoring 78 was "HR Review" to Keka and "shortlisted" to the pipeline.
  Whichever wrote last won.
- It minted its **own** assessment tokens and sent its **own** invitation emails,
  from a different code path with different dedup rules.
- `handleAssessmentCompletion` wrote status *and* scheduled its own interview
  (flat +2 calendar days, weekends included) before the caller's scheduling ran.
- The candidate upsert copied Keka's stage names straight into `status`.
- It **invented scores from years of experience alone** (5+ yrs → 84, 3+ → 76,
  1+ → 68, else 64). 84 clears the 80% shortlist bar, so any Keka candidate with
  five years' experience was auto-shortlisted and emailed an assessment without a
  resume ever being read.

Per your decision, Keka is now **jobs and resumes only**
(`KEKA_OWNS_CANDIDATE_STATUS=false`). It still receives a one-way mirror of *our*
stage decisions so recruiters see the same thing in Keka, but it no longer writes
status, mints tokens, sends email, schedules interviews, or guesses scores.

---

## Part 2 — The seven requirements

| # | Requirement | How it works now |
|---|---|---|
| 1 | Only new applicants from today; Email + Keka only | `INGESTION_CUTOFF_DATE` enforced on all four intake paths (IMAP, Zoho OAuth, Keka re-screen, autonomous cycle). Undated mail is skipped rather than assumed recent. |
| 2 | Map only to the correct active job; send acknowledgement | `STRICT_JOB_MAPPING=true`: a candidate is attached only to the opening identified from their application. If it can't be determined they go to HR Review **unmapped** — never auto-assigned by best match. Acknowledgement fires once per candidate at intake. |
| 3 | AI parsing, scoring, ranking, shortlisting | Mock/fabricating parsers removed from the default path; AI output validated and bounded; ≥80 shortlist, 60–79 review, <60 reject, all from one shared threshold set. |
| 4 | Assessment to eligible shortlisted only, 7 days, day 3/4 reminder | Dispatch requires: shortlisted + active job + not already invited. 7-day window genuinely enforced. Exactly one reminder on day 3–4, tracked by `assessment_reminder_sent_at`. |
| 5 | HR manual send for candidates under review | `POST /api/assessment/send` retained. Now requires a real active job (pass `jobId` to attach an unmapped candidate) and supports `{ resend: true }` for a deliberate re-issue. |
| 6 | Post-assessment: pass → interview + calendar; else Review/Reject | ≥80 → Qualified → interview on the next business day slot + `.ics` calendar invite. 60–79 → Review (HR decides). <60 → Rejected. |
| 7 | Notify HR and candidate after scheduling | Candidate gets the invite with calendar attachment; HR copy goes to `HR_NOTIFICATION_EMAIL` when `ENABLE_HR_EMAIL_NOTIFICATIONS=true`. Existing HR interview dashboard untouched. |

**No duplicate emails:** each stage email is once-per-candidate-ever, recorded in
`email_logs` on both success and failure. Failures are retried; successes never
repeat.

---

## Part 3 — Execution steps

Run these in order. Steps 1–2 change nothing until you pass `--confirm`.

### Step 1 — Migrate the schema

```bash
npm run init-db
```

Adds `jobs.status`, `candidates.assessment_invited_at`,
`candidates.assessment_reminder_sent_at`, the interview uniqueness index and the
email dedup indexes.

### Step 2 — Clear the portal (archive first)

```bash
# Dry run — prints row counts, changes nothing
npx tsx src/scripts/resetPortalData.ts

# Approved run
CONFIRM_DESTRUCTIVE_ACTION=YES npx tsx src/scripts/resetPortalData.ts --confirm
```

Copies every pipeline table into `archive_<table>` (stamped with a batch id),
clears the live tables, then re-syncs active openings from Keka careers.

**Preserved:** tenants, users, refresh tokens, licence keys, email templates,
support tickets. **Archived, not destroyed:** all candidate, job, application,
assessment, interview and email-log history.

Review the archive before considering it final:

```sql
SELECT archive_batch, COUNT(*) FROM archive_candidates GROUP BY archive_batch;
```

### Step 3 — Rebuild the front end (required for the assessment fix)

```bash
npm run build
```

`NEXT_PUBLIC_API_URL` is compiled into the browser bundle, so **the assessment
fix does not take effect until you rebuild and redeploy the front end.** Verify:

```bash
grep -r "localhost:4000" .next/static/ | head
```

That must return nothing. If it matches, the build picked up the wrong `.env`.

### Step 4 — Set the cutoff to your go-live date

In `.env`, confirm `INGESTION_CUTOFF_DATE` is the date you want intake to begin
(currently `2026-07-30`). Nothing before this date is ever processed.

### Step 5 — Restart and confirm the boot banner

```
🔗 [Config] Candidate-facing links will be built from: https://app.risonaitech.com
🗓️  [Config] Ingestion cutoff: 2026-07-30T...
🧠 [Config] AI resume parsing providers (in failover order): DeepSeek → Gemini
```

### Step 6 — Verify active openings

Confirm the portal shows only genuinely open requisitions. Close any stragglers
with `DELETE /api/jobs/:id` — that soft-closes and preserves history.

### Step 7 — End-to-end smoke test

Send one application to the recruitment mailbox with the job title in the subject:

1. Candidate appears once, mapped to the correct opening, with a real AI score.
2. Exactly one acknowledgement email.
3. If ≥80: exactly one assessment invitation with a working link.
4. Open the link — the assessment loads (this is the "access prohibited" fix).
5. Submit. If ≥80 final: interview scheduled on a **weekday** + calendar invite.
6. Check `email_logs` — one row per stage, no repeats.

---

## Part 4 — Verification

```bash
npx tsc --noEmit                          # app: 0 errors
npx tsc -p tsconfig.worker.json           # worker: 0 errors (see note)
npm run lint                              # 0 errors, 1 cosmetic warning
npx tsx src/test/verifyPipelineFixes.ts   # 39 checks
```

The harness needs no database and performs no writes.

**Note:** `src/worker` is excluded from the main `tsconfig.json`, so it is not
type-checked by default. That gap hid a broken import in `parseWorker.ts`. I
type-check it separately; consider removing the exclusion.

### Not verified here

- `next build` could not run in my sandbox — `node_modules` was installed on
  macOS, so the Linux `@next/swc` and `esbuild` binaries are absent and the npm
  registry is unreachable. Run it locally (step 3).
- The reset script and migration are reviewed but not executed: the only
  reachable database is production. Both are transactional, and the reset has a
  dry-run default.

---

## Part 5 — Two things worth your decision

1. **Unmapped applicants need an HR queue.** With strict mapping on, any
   application whose target job can't be determined from the subject line waits
   in HR Review with no `job_id`. That is correct — but if your inbound emails
   rarely name the job, this queue could be large. Watch the
   `"N applicant(s) await manual job mapping"` line in the logs for the first few
   days; if it's high, we should improve subject parsing rather than loosen the
   rule.

2. **The results email still sends candidates the full answer key** — every
   question with the correct option marked. A candidate can forward it to the next
   applicant. It looks deliberate, so I left it, but I'd suggest the candidate
   copy show only their score, with the breakdown going to HR.

Still open from the previous pass: job-match scoring is keyword-based rather than
using the AI sub-scores the parser already returns (`skillsScore`,
`experienceScore`, `industryScore`, `educationScore`, `locationScore`). Wiring
those in would make ranking meaningfully more accurate — a behaviour change, so
worth doing deliberately rather than as part of a stabilization pass.
