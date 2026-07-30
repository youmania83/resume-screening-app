# MASTER PROMPT — Autonomous Backend Rebuild, Frontend Preserved

> Paste everything below this line into the agent (Antigravity / Claude Code /
> similar) as a single task. It is self-contained: it defines the mission, the
> frozen contract, the phase plan, the verification gates, and the stop
> conditions. The agent should not need to ask questions to proceed.

---

## MISSION

Rebuild the backend of this AI resume-screening application cleanly, in place,
**without changing the frontend or breaking any behaviour it depends on**. Work
fully autonomously: plan, implement, verify, and iterate until every gate in
this document passes. Do not stop at the first success — stop when ALL gates
pass together on a clean run.

You are rebuilding for correctness and maintainability, not adding features.
Identical observable behaviour through the frozen contract, cleaner internals.

## GROUND RULES (read before any edit)

1. **The frontend is FROZEN.** Do not edit anything under `app/`,
   `src/components/`, `src/hooks/`, `src/services/AssessmentApiService.ts`,
   `styles/`, `tailwind.config.js`, `postcss.config.mjs`, or `next.config.js`.
   If a backend change appears to require a frontend change, the backend change
   is wrong — redesign it.
2. **The API contract is FROZEN** (inventory below). Every route keeps its
   method, path, request shape, response JSON shape, and status-code semantics.
   The frontend reads specific field names (`success`, `error`, `jobs`,
   `candidates_count`, snake_case DB fields passed through, etc.) — treat the
   current responses as the specification. When in doubt, read the consuming
   hook/component to see which fields it destructures, and match them.
3. **The database schema is FROZEN as a floor.** You may ADD columns, indexes
   and tables via `src/lib/initDb.ts` (idempotent `IF NOT EXISTS` style only).
   You may not rename, drop, or retype existing columns — production data
   exists.
4. **`.env` keys are FROZEN as a floor.** Existing keys keep their meaning. New
   keys need safe defaults and documentation in `.env.example`.
5. **Never hardcode credentials** anywhere, including tests and docs.
6. **Never run destructive scripts** (`resetPortalData.ts`,
   `purgeRejectedCandidates.ts`, `resetPreJuly29Data.ts`, anything that
   DELETEs/TRUNCATEs user data). They exist; leave them; do not invoke them.
7. **Never send real email or call live external APIs** during the rebuild.
   Verify email/Keka/Zoho logic through the module seams, not live calls.
8. Work on a branch: `git checkout -b rebuild/backend-v2`. Commit in small,
   verified increments with descriptive messages. Never commit with failing
   gates.

## ARCHITECTURE (what you are rebuilding)

Stack: Next.js 16 frontend (port 3000) · Express 5 API (`src/api/server.ts`,
port 4000) · BullMQ worker (`src/worker/resumeWorker.ts`) over Redis · Postgres
(Supabase) via `pg` · node-cron schedules inside the API process · PM2 in prod
(`ecosystem.config.cjs`: rison-frontend / rison-backend / rison-worker).

Pipeline (this exact flow must survive the rebuild):

```
INTAKE      Email (IMAP EmailSyncService + Zoho OAuth zohoMail.service) and
            Keka (jobs + resumes ONLY — never candidate status)
              → resume_inbox row → BullMQ 'resume-eval-queue'
SCREEN      resumeWorker.parseAndEvalResume:
              extract text (pdf-parse/mammoth) → AI parse with provider
              failover (DeepSeek→OpenAI→Gemini) → validate → dedup by
              email/phone (repeat applicant = UPDATE existing, never a new row)
              → match ONLY to the active job they applied for
              (STRICT_JOB_MAPPING) → score
ROUTE       score ≥80 shortlist · 60–79 Review · <60 reject
            (PIPELINE_THRESHOLDS in src/lib/appConfig.ts — single source)
INVITE      exactly once (assessment_invited_at + email_logs guard), 7-day
            token, one reminder on day 3–4 (assessment_reminder_sent_at)
ASSESS      GET /api/assessment/:token — EXACT token match only; real expiry;
            15 MCQs; sessions/violations/save-progress preserved
COMPLETE    final = resume*0.4 + assessment*0.6; ≥80 Qualified → interview on
            next BUSINESS day + .ics (stable UID); 60–79 Review; <60 Rejected
CRON        30-min autonomous cycle · 5-min mail sync · daily 9:00 reminders ·
            daily 2:00 storage pruning (guarded) · hourly session cleanup —
            all Redis-lock protected (runWithLock), all scoped to
            INGESTION_CUTOFF_DATE and active jobs
```

Key modules and their roles — keep the seams even if you reorganise internals:
`src/lib/appConfig.ts` (ALL shared config/thresholds — never duplicate these),
`src/lib/email.ts` (senders + `canSendEmailToCandidate` dedup guard +
`recordEmailLog`), `src/lib/parser/ResumeParserProvider.ts` (AI failover;
MockParser only behind `ALLOW_MOCK_PARSER`),
`src/services/AutonomousRecruitmentService.ts` (30-min cycle),
`src/lib/assessmentService.ts` (MCQ generation),
`src/lib/initDb.ts` (idempotent migrations), `src/lib/tenantDb.ts` /
`tenantContext.ts` (tenant scoping — every business-table write carries
tenant_id).

## FROZEN API CONTRACT (mounts in src/api/server.ts)

```
/api/auth:        POST /refresh /logout /silent-login · GET /me
/api/resumes:     POST /upload
/api/health:      GET / /liveness /readiness /diagnostics · POST /prune-storage
/api/score:       POST / · POST /:batchId
/api/jobs:        GET / /:id · POST / /extract · PUT /:id · DELETE /:id (soft-close!)
/api/ranking:     GET /:batchId
/api/evaluate:    POST /   (requires an existing ACTIVE job — never creates one)
/api/candidates:  GET / /:id /stats /recruiters/list · POST / /remap-roles
                  /rescreen-all /:id/decision · PUT /:id · DELETE /:id
/api/assessment:  POST /generate /send /submit /violation /public-register
                  /regenerate /:token/save-progress /:token/heartbeat
                  /:token/force-resume · GET /:token /results/get /job-info/:jobId
/api/interview:   GET /candidate/:candidateId · POST /schedule /feedback
/api/stages:      GET / · POST / · PUT /reorder /:id · DELETE /:id
/api/dashboard:   GET /metrics /pipeline
/api/inbox:       GET / /stats /purge-junk /email-health /scoring-weights ·
                  POST /merge /retry/:id /delete/:id /email-sync /scoring-weights
/api/candidate-portal: GET /:token · POST /:token/confirm /:token/reschedule /:token/resume
/api/email:       GET /zoho-status /settings /templates · POST /zoho-test
                  /settings /send /test-routing · PUT /templates/:name
/api/calendar:    GET /settings · POST /settings /schedule /reschedule /cancel
/api/support-tickets: POST /public / · GET / · PATCH /:id
/api/admin/logs · /api/metrics · /api (webhooks: calcom, keka, zoho routers)
+ per-candidate routers: notes, tags, timeline, documents, assignments, submissions
```

Also frozen: CORS/CSRF behaviour (assessment + webhook paths bypass CSRF),
cookie-based auth flow, and the global error-handler JSON shape
`{ success: false, error: string }`.

## INVARIANTS — regressions previously shipped to production. Violating any of
these is an automatic gate failure:

- I1  No fabricated data, ever. No mock parser in the default path, no fake
      resume files, no invented/heuristic scores (no `|| 70`, no
      experience→score tables, no baseline 60). Score 0 = "not yet screened".
      If all AI providers fail: throw, mark retryable, retry next cycle.
- I2  Exact assessment-token match only. No candidate-id/email/partial-token
      lookup fallbacks (cross-candidate access).
- I3  Token expiry is real. Nothing extends it on page load.
- I4  Stage emails are exactly-once per candidate (email_logs +
      `canSendEmailToCandidate`); only `delivery_status='sent'` counts;
      failures retry, successes never repeat. Reminder: once, day 3–4.
- I5  Only ACTIVE jobs (`COALESCE(status,'active')='active' AND sync_status IS
      DISTINCT FROM 'removed'`) are ever matched, invited against, counted, or
      listed by default.
- I6  No code path creates a job from candidate/AI-inferred role text.
      Jobs come from HR or the Keka careers sync only.
- I7  STRICT_JOB_MAPPING: applicant attaches only to the job they applied for;
      undetermined → HR Review unmapped. No best-match auto-assignment, no
      periodic re-mapping sweep.
- I8  Repeat applications merge into the existing candidate row.
- I9  Keka never writes candidate status/stage/tokens/emails
      (KEKA_OWNS_CANDIDATE_STATUS=false); outbound stage mirroring only.
- I10 Ingestion cutoff (INGESTION_CUTOFF_DATE) enforced on every intake path
      and every bulk cron query. Undated email is skipped, not assumed new.
- I11 Interviews: business days only, one live booking per candidate
      (partial unique index), tenant_id always set, stable .ics UID.
- I12 Candidate data is never auto-deleted. DELETE /api/jobs/:id soft-closes.
      Storage pruning keeps its guards (empty-reference abort, ≥50% abort,
      48h grace).
- I13 Every business-table write sets tenant_id; queries are tenant-scoped;
      no cross-tenant matching.
- I14 Thresholds/URLs/config come from `src/lib/appConfig.ts` only — one
      definition each. `NEXT_PUBLIC_*` is build-time: candidate links from
      `buildAssessmentLink()`, never hand-assembled, never localhost fallbacks
      in server code paths that reach candidates.

## PHASE PLAN

Work phases in order. Each phase ends with ALL gates green before the commit.

- P0  Baseline: record current outputs of every gate; snapshot the API surface
      (script it: extract method+path from all routers → `docs/api-surface.txt`).
      This snapshot is your contract-diff tool for every later phase.
- P1  Foundation: config (`appConfig`), db access, tenant context, logging,
      migrations. No behaviour change.
- P2  Domain services: parser (failover+validation), email (guards+logging),
      scoring/routing, assessment lifecycle, interview scheduling. Add unit
      tests to the harness for each invariant they own.
- P3  Intake: EmailSync (IMAP), Zoho OAuth sync, Keka jobs+resumes, upload
      route, queue + worker. Dedup, cutoff, strict mapping.
- P4  API routes: rebuild router-by-router against the frozen contract;
      after each router, diff the API surface against P0 and spot-check the
      consuming frontend hook/component for field-name compatibility.
- P5  Cron/autonomous cycle: locks, cutoff scoping, exactly-once dispatch.
- P6  Full verification sweep + `docs/REBUILD_NOTES.md` (what moved where,
      any intentional internal changes, migration notes).

## VERIFICATION GATES (run after every phase; all must pass)

```bash
npx tsc --noEmit                          # G1  app typecheck: 0 errors
npx tsc -p tsconfig.worker.json           # G2  worker typecheck (excluded from
                                          #     the main tsconfig — check it!)
npx eslint src app --ext .ts,.tsx         # G3  0 errors
npx tsx src/test/verifyPipelineFixes.ts   # G4  39/39 regression checks
npm run build                             # G5  production build clean
grep -r "localhost:4000" .next/static/    # G6  MUST return nothing
git diff --stat app/ src/components/ src/hooks/   # G7  MUST be empty
diff <(api-surface-now) docs/api-surface.txt      # G8  MUST be empty
```

Additionally EXTEND `src/test/verifyPipelineFixes.ts` with a check for every
invariant I1–I14 not already covered, plus grep-based negative checks for the
forbidden patterns: `ILIKE '%${` on token lookups, `INSERT INTO jobs` outside
jobRouter/Keka-sync/initDb, score fallbacks (`|| 6x`, `|| 7x`, `|| 8x`) on
candidate inserts, `DELETE FROM candidates` outside gated scripts,
`assessment_token_expiry` writes in GET handlers. The suite must stay
DB-free and side-effect-free.

If a gate fails: fix, re-run ALL gates, only then commit. If the same gate
fails 3 times in a row on the same root cause, write the analysis to
`docs/REBUILD_BLOCKED.md` and stop rather than thrash.

## STOP CONDITIONS

Stop and report (do not improvise) if: a contract change appears unavoidable;
a schema change beyond additive is needed; any instruction here conflicts with
what you find in the code (report the discrepancy — the code's observable
behaviour wins for the contract, this document wins for the invariants); or
you believe a destructive operation is required.

## DONE means

All gates G1–G8 green in one clean run · invariants I1–I14 each covered by an
automated check · frontend untouched (G7) · API surface identical (G8) ·
`docs/REBUILD_NOTES.md` written · branch `rebuild/backend-v2` with clean
incremental history, not merged (human reviews and merges).
```

---

*(end of master prompt)*
