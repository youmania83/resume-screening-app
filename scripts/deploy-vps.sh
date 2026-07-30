#!/usr/bin/env bash
#
# deploy-vps.sh — deploy the stabilization release to the VPS.
#
# Run this ON THE VPS, from the application directory:
#
#   cd /path/to/resume-screening-app
#   bash scripts/deploy-vps.sh
#
# It is safe to re-run. It stops before doing anything destructive and prints
# what it is about to do. The portal data reset is deliberately NOT part of this
# script — run that separately once you are happy the deploy is healthy.

set -euo pipefail

RED=$'\033[0;31m'; GRN=$'\033[0;32m'; YEL=$'\033[1;33m'; BLU=$'\033[0;34m'; NC=$'\033[0m'
step() { echo; echo "${BLU}==> $*${NC}"; }
ok()   { echo "${GRN}  ✓ $*${NC}"; }
warn() { echo "${YEL}  ! $*${NC}"; }
fail() { echo "${RED}  ✗ $*${NC}"; exit 1; }

step "0. Preflight"

[ -f package.json ] || fail "Run this from the application root (no package.json here)."
command -v node >/dev/null || fail "node is not installed."
command -v pm2  >/dev/null || fail "pm2 is not installed (npm i -g pm2)."
ok "node $(node -v), pm2 present"

[ -f .env ] || fail ".env is missing. It is gitignored, so it must exist on this server."

# ── The single most important check ──────────────────────────────────────────
# NEXT_PUBLIC_* variables are compiled into the browser bundle at BUILD time.
# If NEXT_PUBLIC_API_URL points at localhost, every candidate's browser tries to
# reach port 4000 on their own machine and the assessment shows "Access
# Prohibited". This is the bug this release fixes — but only if .env is correct
# HERE, on the build machine.
step "1. Verify candidate-facing URLs in .env"

API_URL=$(grep -E '^NEXT_PUBLIC_API_URL=' .env | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
APP_URL=$(grep -E '^NEXT_PUBLIC_APP_URL=' .env | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)

[ -n "$API_URL" ] || fail "NEXT_PUBLIC_API_URL is not set in .env"
[ -n "$APP_URL" ] || fail "NEXT_PUBLIC_APP_URL is not set in .env (candidate links will be dead)"

case "$API_URL" in
  *localhost*|*127.0.0.1*)
    fail "NEXT_PUBLIC_API_URL=$API_URL uses localhost.
       Candidates' browsers cannot reach that. Set it to the public API host,
       e.g. https://api.risonaitech.com/api, then re-run." ;;
esac
case "$APP_URL" in
  *localhost*|*127.0.0.1*)
    fail "NEXT_PUBLIC_APP_URL=$APP_URL uses localhost.
       Assessment links in emails would be dead. Set it to the public front-end
       host, e.g. https://app.risonaitech.com, then re-run." ;;
esac

ok "NEXT_PUBLIC_API_URL = $API_URL"
ok "NEXT_PUBLIC_APP_URL = $APP_URL"

step "2. Verify the new pipeline settings are present"

for key in INGESTION_CUTOFF_DATE STRICT_JOB_MAPPING KEKA_OWNS_CANDIDATE_STATUS ALLOW_MOCK_PARSER; do
  if grep -qE "^${key}=" .env; then
    ok "$key = $(grep -E "^${key}=" .env | tail -1 | cut -d= -f2-)"
  else
    warn "$key is not set in .env — the built-in default will be used. See .env.example."
  fi
done

if grep -qE '^ALLOW_MOCK_PARSER=true' .env; then
  fail "ALLOW_MOCK_PARSER=true would let the app fabricate candidate data. Set it to false."
fi

step "3. Back up the current release"

BACKUP="../resume-screening-app-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
cp .env "$BACKUP/.env" 2>/dev/null || true
git rev-parse HEAD > "$BACKUP/previous-commit.txt" 2>/dev/null || true
ok "Backed up .env and current commit to $BACKUP"
ok "Roll back with: git reset --hard \$(cat $BACKUP/previous-commit.txt)"

step "4. Pull the release"

git fetch --all --prune
git status --porcelain | grep -q . && warn "Local modifications present on the server; they will be preserved by merge."
git pull --ff-only origin main || fail "git pull failed. Resolve manually, then re-run."
ok "Now at $(git log --oneline -1)"

step "5. Install dependencies"

if [ -f package-lock.json ]; then
  npm ci --omit=dev --ignore-scripts=false 2>/dev/null || npm ci || fail "npm ci failed"
else
  npm install || fail "npm install failed"
fi
ok "Dependencies installed"

step "6. Type check (build now fails on type errors by design)"

npx tsc --noEmit || fail "Type check failed — not deploying a broken build."
ok "Type check clean"

step "7. Run the regression checks"

npx tsx src/test/verifyPipelineFixes.ts || fail "Regression checks failed — investigate before deploying."
ok "Regression checks passed"

step "8. Apply database migrations"

npm run init-db || fail "init-db failed. Fix before continuing — the app expects the new columns."
ok "Schema up to date"

step "9. Build the front end"

# This is what actually bakes NEXT_PUBLIC_API_URL into the candidate bundle.
rm -rf .next
npm run build || fail "next build failed"

step "10. Verify the built bundle does NOT contain a localhost API URL"

if grep -rq "localhost:4000" .next/static/ 2>/dev/null; then
  fail "The built bundle still references localhost:4000.
       The build picked up the wrong .env. Fix NEXT_PUBLIC_API_URL and re-run."
fi
ok "Bundle points at the public API host"

step "11. Restart services"

pm2 restart ecosystem.config.cjs --env production --update-env || \
  pm2 start ecosystem.config.cjs --env production
pm2 save
ok "Services restarted"

step "12. Health check"

sleep 6
for i in 1 2 3 4 5; do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    ok "Backend healthy"
    break
  fi
  [ "$i" = 5 ] && warn "Backend health check did not pass — check: pm2 logs rison-backend"
  sleep 4
done

curl -fsS http://127.0.0.1:3000 >/dev/null 2>&1 && ok "Frontend responding" || warn "Frontend not responding — check: pm2 logs rison-frontend"

echo
echo "${GRN}Deploy complete.${NC}"
echo
echo "Confirm the boot banner shows the right values:"
echo "  pm2 logs rison-backend --lines 60 | grep -E 'Config|cutoff|providers'"
echo
echo "Expected:"
echo "  🔗 [Config] Candidate-facing links will be built from: $APP_URL"
echo "  🗓️  [Config] Ingestion cutoff: ..."
echo "  🧠 [Config] AI resume parsing providers (in failover order): ..."
echo
echo "${YEL}The portal data reset is NOT part of this deploy.${NC}"
echo "When you are ready, run it separately (dry run first):"
echo "  npx tsx src/scripts/resetPortalData.ts"
echo "  CONFIRM_DESTRUCTIVE_ACTION=YES npx tsx src/scripts/resetPortalData.ts --confirm"
echo
