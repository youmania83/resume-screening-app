# Deploy to VPS — exact steps

I could not push or deploy from here: this session's sandbox has **no outbound
network**, so it cannot reach `github.com` or `129.121.97.152`. Everything is
committed and ready; the commands below are the whole job.

**Committed:** `b573fe1 fix: stabilize recruitment workflow end-to-end for go-live`
(15 files, +1360/−224).

---

## On your Mac

A stale git lock is left over (the sandbox is not permitted to delete files), and
the deploy script is still untracked:

```bash
cd "/Users/yogeshkumarwadhwa/IRA AI RESUME SCREENING SAAS/resume-screening-app"

rm -f .git/index.lock

git add scripts/deploy-vps.sh docs/DEPLOY_NOW.md
git commit -m "chore: add guarded VPS deploy script"

git log --oneline -3      # expect b573fe1 plus the commit above
git push origin main
```

---

## On the VPS — update `.env` FIRST

`.env` is gitignored, so **none of the configuration changes travel with the
code**. The VPS has its own `.env`, and the assessment fix depends entirely on it.

```bash
ssh root@129.121.97.152
cd /path/to/resume-screening-app

cp .env .env.backup-$(date +%F)
nano .env
```

Set these. The first one is the actual fix for "access prohibited":

```ini
# CRITICAL — compiled into the browser bundle at build time.
# If this is localhost, every candidate's browser tries to reach port 4000 on
# their own machine, and the assessment shows "Access Prohibited".
NEXT_PUBLIC_API_URL=https://api.risonaitech.com/api

# Public front-end host — assessment links in emails are built from this.
NEXT_PUBLIC_APP_URL=https://app.risonaitech.com

# Intake starts here. Nothing older is ever processed.
INGESTION_CUTOFF_DATE=2026-07-30

# Applicants attach only to the opening they applied for.
STRICT_JOB_MAPPING=true

# Keka supplies jobs and resumes only; it must not write candidate status.
KEKA_OWNS_CANDIDATE_STATUS=false

# Must stay false — true lets the app fabricate candidate data on AI failure.
ALLOW_MOCK_PARSER=false
AI_PARSE_ATTEMPTS=2

# Assessment window and reminder days.
ASSESSMENT_VALIDITY_DAYS=7
ASSESSMENT_REMINDER_DAYS=3,4

# Stage thresholds.
PIPELINE_SHORTLIST_THRESHOLD=80
PIPELINE_REVIEW_THRESHOLD=60
PIPELINE_JOB_MATCH_FLOOR=50
PIPELINE_INTERVIEW_THRESHOLD=80

# Email rate ceilings (per-stage dedup is automatic).
MAX_EMAILS_PER_RECIPIENT_PER_DAY=6
MAX_EMAILS_PER_RECIPIENT_LIFETIME=25

# HR copies of stage emails. Set an address and flip to true if you want them.
HR_NOTIFICATION_EMAIL=
ENABLE_HR_EMAIL_NOTIFICATIONS=false

# Storage pruning safety limits.
STORAGE_PRUNE_MIN_AGE_HOURS=48
STORAGE_PRUNE_MAX_RATIO=0.5

# Required (with --confirm) by any destructive script. Leave blank.
CONFIRM_DESTRUCTIVE_ACTION=

# Legacy worker — must stay false, it competes for the real queue.
ENABLE_LEGACY_PARSE_WORKER=false
```

Keep every existing value (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`,
`ENCRYPTION_KEY`, the Zoho and Keka credentials) exactly as it is.

---

## On the VPS — deploy

```bash
git pull origin main
bash scripts/deploy-vps.sh
```

The script refuses to proceed on a bad config, and will:

1. Reject a localhost `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_APP_URL`
2. Reject `ALLOW_MOCK_PARSER=true`
3. Back up `.env` and the current commit (rollback is one command)
4. `npm ci`, type check, run the 39 regression checks
5. `npm run init-db` — applies the new columns and indexes
6. Rebuild the front end (this is what bakes in the correct API URL)
7. **Assert the built bundle contains no `localhost:4000`** — this is the check
   that proves the assessment fix actually shipped
8. `pm2 restart` + health check

Then confirm the boot banner:

```bash
pm2 logs rison-backend --lines 60 | grep -E "Config|cutoff|providers"
```

Expected:

```
🔗 [Config] Candidate-facing links will be built from: https://app.risonaitech.com
🗓️  [Config] Ingestion cutoff: 2026-07-30T...
🧠 [Config] AI resume parsing providers (in failover order): DeepSeek → Gemini
```

---

## Then, separately — clear the portal

Deliberately **not** part of the deploy. Run it once the deploy is healthy:

```bash
# Dry run — prints row counts, changes nothing
npx tsx src/scripts/resetPortalData.ts

# Approved run — archives to archive_* tables, then clears the live tables
CONFIRM_DESTRUCTIVE_ACTION=YES npx tsx src/scripts/resetPortalData.ts --confirm
```

Verify the archive before you consider it done:

```sql
SELECT archive_batch, COUNT(*) FROM archive_candidates GROUP BY archive_batch;
```

---

## Smoke test

Send one application to the recruitment mailbox with the job title in the subject:

1. Candidate appears **once**, mapped to the correct opening, real AI score
2. Exactly one acknowledgement email
3. If ≥80 — exactly one assessment invitation
4. **Open the link on a phone or another network** — this is the fix; it must
   load, not show "Access Prohibited"
5. Submit — if the final score ≥80, interview scheduled on a **weekday**, with a
   calendar invite
6. `SELECT template, COUNT(*) FROM email_logs GROUP BY template;` — no repeats

---

## Rollback

```bash
cd /path/to/resume-screening-app
git reset --hard $(cat ../resume-screening-app-backup-*/previous-commit.txt | tail -1)
cp ../resume-screening-app-backup-*/.env .env
npm ci && npm run build
pm2 restart ecosystem.config.cjs --env production --update-env
```

The schema migration is additive (new nullable columns and indexes only), so it
does not need reverting.
