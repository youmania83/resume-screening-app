# Deployment rules — VPS release

Workspace rule for agents (Antigravity reads `.agent/rules/*.md` and `AGENTS.md`).
Applies to any task involving deploying, releasing, or shipping this application.

## The one-command deploy

```bash
bash scripts/deploy-remote.sh --dry-run   # verify configuration, change nothing
bash scripts/deploy-remote.sh             # deploy
bash scripts/deploy-remote.sh --rollback  # revert to the previous release
```

`deploy-remote.sh` runs on the local machine and drives the VPS over SSH.
`deploy-vps.sh` is the same procedure run directly on the server. Use the remote
one unless you are already SSH'd in.

**Always run `--dry-run` first.** It performs every check and no mutation.

## Non-negotiable rules

1. **Never hardcode credentials.** No password, API key, or connection string in
   any committed file. SSH config belongs in `.deploy.env` (gitignored) or the
   environment. Prefer key auth over passwords.

2. **Never deploy with a dirty or unpushed working tree.** The VPS builds from
   the pushed branch — uncommitted work silently does not ship.

3. **Never skip the built-bundle check.** After the front end builds, the script
   greps `.next/static/` for `localhost:4000`. This is the check that proves the
   candidate-facing assessment fix actually shipped. If it matches, the build read
   the wrong `.env` — fix and rebuild. Do not deploy past this.

4. **`.env` is gitignored and does NOT deploy with the code.** Any new setting
   must be added to the VPS `.env` by hand *before* deploying. `.env.example` is
   the reference list. Forgetting this is the single most common failure mode
   here, because the app keeps running while behaving wrongly.

5. **Never run the portal data reset as part of a deploy.** `resetPortalData.ts`
   is destructive and stays a separate, explicitly approved step. It requires both
   `CONFIRM_DESTRUCTIVE_ACTION=YES` and `--confirm`.

6. **Do not weaken a guard to make a deploy pass.** If the type check, the
   regression suite, or a config assertion fails, fix the cause. These guards exist
   because each one corresponds to a bug that reached production.

## Why the build step matters

`NEXT_PUBLIC_*` variables are compiled into the browser bundle by `next build`.
They are **not** read at runtime. If `NEXT_PUBLIC_API_URL` is wrong at build time,
every candidate's browser tries to reach an address that does not exist for them,
and the assessment portal shows "Access Prohibited".

Changing `.env` therefore has no effect until the front end is rebuilt **on the
host that serves it**. A restart alone does nothing.

## Deployment order

1. Update `.env` on the VPS (compare against `.env.example`)
2. `bash scripts/deploy-remote.sh --dry-run`
3. `bash scripts/deploy-remote.sh`
4. Confirm the boot banner: `pm2 logs rison-backend | grep "\[Config\]"`
5. Smoke test an assessment link **from a phone or another network**
6. Only then, if intended, run the portal reset separately

## Verifying a release

```bash
npx tsc --noEmit                          # app
npx tsc -p tsconfig.worker.json           # worker (excluded from the main config)
npm run lint
npx tsx src/test/verifyPipelineFixes.ts   # 39 regression checks, no DB needed
```

`src/worker` is excluded from `tsconfig.json`, so it is not type-checked by
default. That gap previously hid a broken import. Check it separately.

## Health and rollback

```bash
pm2 status
pm2 logs rison-backend --lines 100
curl -fsS http://127.0.0.1:4000/api/health

bash scripts/deploy-remote.sh --rollback
```

Rollback restores the previous commit and rebuilds. The schema migration is
additive (new nullable columns and indexes only) and does not need reverting.

## Smoke test after any pipeline change

Send one application to the recruitment mailbox with the job title in the subject:

1. Candidate appears **once**, mapped to the correct opening, with a real AI score
2. Exactly one acknowledgement email
3. If score ≥80 — exactly one assessment invitation
4. The assessment link opens (test off-network)
5. On submit, final ≥80 schedules a **weekday** interview with a calendar invite
6. `SELECT template, COUNT(*) FROM email_logs GROUP BY template;` — no duplicates
