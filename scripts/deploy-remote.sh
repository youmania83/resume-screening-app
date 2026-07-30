#!/usr/bin/env bash
#
# deploy-remote.sh — drive the VPS deployment from your local machine.
#
# Run this from the Antigravity terminal (or any local shell). It orchestrates
# the whole release: verifies your local repo is pushed, checks the remote
# configuration, then runs the on-server deploy and health-checks the result.
#
#   bash scripts/deploy-remote.sh --dry-run     # show the plan, change nothing
#   bash scripts/deploy-remote.sh               # deploy
#   bash scripts/deploy-remote.sh --rollback    # revert to the previous release
#
# Configuration (environment variables, or a .deploy.env file beside this repo):
#   VPS_HOST      default 129.121.97.152
#   VPS_USER      default root
#   VPS_APP_DIR   default /root/resume-screening-app
#   VPS_SSH_KEY   path to a private key (recommended)
#   VPS_PASSWORD  fallback password auth; requires sshpass
#
# SECURITY: this script never hardcodes a credential. Prefer key auth:
#   ssh-keygen -t ed25519 -C "deploy@antigravity"
#   ssh-copy-id -i ~/.ssh/id_ed25519.pub root@129.121.97.152

set -euo pipefail

# ── Presentation ─────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  RED=$'\033[0;31m'; GRN=$'\033[0;32m'; YEL=$'\033[1;33m'; BLU=$'\033[0;34m'; DIM=$'\033[2m'; NC=$'\033[0m'
else
  RED=""; GRN=""; YEL=""; BLU=""; DIM=""; NC=""
fi
step() { echo; echo "${BLU}==> $*${NC}"; }
ok()   { echo "${GRN}  ✓${NC} $*"; }
warn() { echo "${YEL}  !${NC} $*"; }
info() { echo "${DIM}    $*${NC}"; }
fail() { echo "${RED}  ✗ $*${NC}" >&2; exit 1; }

# ── Configuration ────────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Optional local config file (gitignored — keep credentials out of the repo).
[ -f .deploy.env ] && . ./.deploy.env

VPS_HOST="${VPS_HOST:-129.121.97.152}"
VPS_USER="${VPS_USER:-root}"
VPS_APP_DIR="${VPS_APP_DIR:-/root/resume-screening-app}"
VPS_SSH_KEY="${VPS_SSH_KEY:-}"
VPS_PASSWORD="${VPS_PASSWORD:-}"
GIT_BRANCH="${GIT_BRANCH:-main}"

DRY_RUN=false
ROLLBACK=false
SKIP_TESTS=false
for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=true ;;
    --rollback)   ROLLBACK=true ;;
    --skip-tests) SKIP_TESTS=true ;;
    -h|--help)
      sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) fail "Unknown option: $arg (try --help)" ;;
  esac
done

# ── SSH plumbing ─────────────────────────────────────────────────────────────
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o ServerAliveInterval=30 -o PreferredAuthentications=password,publickey)
[ -n "$VPS_SSH_KEY" ] && SSH_OPTS+=(-i "$VPS_SSH_KEY")

ssh_prefix=()
if [ -z "$VPS_SSH_KEY" ] && [ -n "$VPS_PASSWORD" ]; then
  command -v sshpass >/dev/null || fail "VPS_PASSWORD is set but sshpass is not installed (brew install hudochenkov/sshpass/sshpass)."
  ssh_prefix=(sshpass -p "$VPS_PASSWORD")
fi

# Run a command on the VPS. Quoting is handled by the caller.
remote() {
  "${ssh_prefix[@]}" ssh "${SSH_OPTS[@]}" "${VPS_USER}@${VPS_HOST}" "$@"
}

# Run a command inside the app directory on the VPS.
remote_app() {
  remote "cd '${VPS_APP_DIR}' && $*"
}

echo "${BLU}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo "${BLU}║  Resume Screening — VPS deploy                                   ║${NC}"
echo "${BLU}╚══════════════════════════════════════════════════════════════════╝${NC}"
info "Target : ${VPS_USER}@${VPS_HOST}:${VPS_APP_DIR}"
info "Branch : ${GIT_BRANCH}"
info "Mode   : $($DRY_RUN && echo 'DRY RUN — nothing will change' || ($ROLLBACK && echo 'ROLLBACK' || echo 'DEPLOY'))"
info "Auth   : $([ -n "$VPS_SSH_KEY" ] && echo "key ($VPS_SSH_KEY)" || ([ -n "$VPS_PASSWORD" ] && echo 'password via sshpass' || echo 'ssh-agent / default key'))"

# ── 1. Local preflight ───────────────────────────────────────────────────────
step "1. Local preflight"

command -v git >/dev/null || fail "git is not installed."
command -v ssh >/dev/null || fail "ssh is not installed."

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Not a git repository: $REPO_ROOT"

PREFLIGHT_CLEAN=true

if [ -n "$(git status --porcelain)" ]; then
  PREFLIGHT_CLEAN=false
  warn "You have uncommitted changes:"
  git status --short | sed 's/^/      /'
  $DRY_RUN || fail "Commit or stash them first — the VPS deploys from the pushed branch, so uncommitted work would silently not ship."
fi

LOCAL_SHA="$(git rev-parse HEAD)"
git fetch --quiet origin "$GIT_BRANCH" 2>/dev/null || warn "Could not fetch origin (offline?). Proceeding with local refs."
REMOTE_SHA="$(git rev-parse "origin/${GIT_BRANCH}" 2>/dev/null || echo '')"

if [ -n "$REMOTE_SHA" ] && [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
  PREFLIGHT_CLEAN=false
  if git merge-base --is-ancestor "$REMOTE_SHA" "$LOCAL_SHA" 2>/dev/null; then
    warn "Local commits are not pushed yet:"
    git log --oneline "origin/${GIT_BRANCH}..HEAD" | sed 's/^/      /'
    $DRY_RUN || fail "Run: git push origin ${GIT_BRANCH}"
  else
    warn "Local branch has diverged from origin/${GIT_BRANCH}. Reconcile before deploying."
    $DRY_RUN || exit 1
  fi
fi

if $PREFLIGHT_CLEAN; then
  ok "Local repo clean and pushed ($(git log --oneline -1))"
else
  warn "Preflight issues above must be resolved before a real deploy (dry run continues)."
fi

# ── 2. Connectivity ──────────────────────────────────────────────────────────
step "2. Connectivity"

remote "echo connected" >/dev/null 2>&1 || fail "Cannot SSH to ${VPS_USER}@${VPS_HOST}.
       Check the host is reachable, and that key or password auth is configured.
       See the SECURITY note at the top of this script."
ok "SSH to ${VPS_HOST} works"

remote "test -d '${VPS_APP_DIR}'" || fail "Remote directory not found: ${VPS_APP_DIR}. Set VPS_APP_DIR."
remote "test -f '${VPS_APP_DIR}/package.json'" || fail "${VPS_APP_DIR} does not look like the app (no package.json)."
ok "Application directory found"

REMOTE_NODE="$(remote 'node -v 2>/dev/null || echo missing')"
[ "$REMOTE_NODE" = "missing" ] && fail "node is not installed on the VPS."
REMOTE_PM2="$(remote 'pm2 -v 2>/dev/null || echo missing')"
[ "$REMOTE_PM2" = "missing" ] && fail "pm2 is not installed on the VPS (npm i -g pm2)."
ok "node ${REMOTE_NODE}, pm2 ${REMOTE_PM2}"

# ── 3. Rollback path ─────────────────────────────────────────────────────────
if $ROLLBACK; then
  step "3. Rollback"
  PREV="$(remote_app "cat .deploy-previous-commit 2>/dev/null || echo ''")"
  [ -z "$PREV" ] && fail "No .deploy-previous-commit on the server — nothing to roll back to."
  info "Rolling back to ${PREV}"
  $DRY_RUN && { ok "DRY RUN — would roll back to ${PREV}"; exit 0; }

  remote_app "git reset --hard '${PREV}'" || fail "git reset failed"
  remote_app "npm ci --silent" || fail "npm ci failed"
  remote_app "rm -rf .next && npm run build" || fail "build failed"
  remote_app "pm2 restart ecosystem.config.cjs --env production --update-env && pm2 save" || fail "pm2 restart failed"
  ok "Rolled back to ${PREV}"
  exit 0
fi

# ── 4. Remote configuration check (the critical one) ─────────────────────────
step "4. Remote .env check"

remote_app "test -f .env" || fail ".env is missing on the VPS. It is gitignored, so it must exist there already."

# NEXT_PUBLIC_* values are compiled into the browser bundle at BUILD time. If the
# API URL points at localhost, every candidate's browser tries to reach port 4000
# on their own machine — that is the "Access Prohibited" failure this release
# fixes, and it can only be fixed on the build host.
REMOTE_API_URL="$(remote_app "grep -E '^NEXT_PUBLIC_API_URL=' .env | tail -1 | cut -d= -f2- | tr -d '\"'\\''' " || echo '')"
REMOTE_APP_URL="$(remote_app "grep -E '^NEXT_PUBLIC_APP_URL=' .env | tail -1 | cut -d= -f2- | tr -d '\"'\\''' " || echo '')"

[ -z "$REMOTE_API_URL" ] && fail "NEXT_PUBLIC_API_URL is not set in the VPS .env."
[ -z "$REMOTE_APP_URL" ] && fail "NEXT_PUBLIC_APP_URL is not set in the VPS .env — candidate assessment links would be dead."

case "$REMOTE_API_URL" in
  *localhost*|*127.0.0.1*)
    fail "VPS NEXT_PUBLIC_API_URL=${REMOTE_API_URL} uses localhost.
       This value is baked into the candidate browser bundle. Set it to the
       public API host (e.g. https://api.risonaitech.com/api) and re-run." ;;
esac
case "$REMOTE_APP_URL" in
  *localhost*|*127.0.0.1*)
    fail "VPS NEXT_PUBLIC_APP_URL=${REMOTE_APP_URL} uses localhost.
       Assessment links in emails would be unreachable. Set the public
       front-end host (e.g. https://app.risonaitech.com) and re-run." ;;
esac
ok "NEXT_PUBLIC_API_URL = ${REMOTE_API_URL}"
ok "NEXT_PUBLIC_APP_URL = ${REMOTE_APP_URL}"

if remote_app "grep -qE '^ALLOW_MOCK_PARSER=true' .env"; then
  fail "ALLOW_MOCK_PARSER=true on the VPS. That lets the app fabricate candidate data when the AI providers fail. Set it to false."
fi
ok "ALLOW_MOCK_PARSER is not enabled"

# Warn (do not block) on settings that fall back to a built-in default.
for key in INGESTION_CUTOFF_DATE STRICT_JOB_MAPPING KEKA_OWNS_CANDIDATE_STATUS ASSESSMENT_VALIDITY_DAYS ASSESSMENT_REMINDER_DAYS; do
  if remote_app "grep -qE '^${key}=' .env"; then
    ok "${key} = $(remote_app "grep -E '^${key}=' .env | tail -1 | cut -d= -f2-")"
  else
    warn "${key} not set on the VPS — the built-in default applies. See .env.example."
  fi
done

if $DRY_RUN; then
  echo
  ok "DRY RUN complete — configuration looks deployable. Re-run without --dry-run to deploy."
  exit 0
fi

# ── 5. Deploy in a single SSH session ───────────────────────────────────────
step "5. Executing full remote release pipeline"

REMOTE_SCRIPT="set -e
cd '${VPS_APP_DIR}'
CURRENT_SHA=\$(git rev-parse HEAD 2>/dev/null || echo 'initial')
echo \"\${CURRENT_SHA}\" > .deploy-previous-commit
cp .env \".env.backup-\$(date +%Y%m%d-%H%M%S)\"

echo '==> 1/6 Pulling latest ${GIT_BRANCH}...'
git fetch --all --prune
git checkout '${GIT_BRANCH}'
git reset --hard 'origin/${GIT_BRANCH}'

echo '==> 2/6 Installing dependencies...'
npm ci --silent

echo '==> 3/6 Running type checks & regression suite...'
npx tsc --noEmit
npx tsx src/test/verifyPipelineFixes.ts

echo '==> 4/6 Running database migration...'
npm run init-db

echo '==> 5/6 Building production frontend...'
rm -rf .next
npm run build

echo '==> 6/6 Restarting PM2 services...'
pm2 restart ecosystem.config.cjs --env production --update-env || pm2 start ecosystem.config.cjs --env production
pm2 save
"

remote "$REMOTE_SCRIPT" || fail "Remote release execution failed on VPS."
ok "Remote build and PM2 restart completed successfully"

# ── 14. Health ───────────────────────────────────────────────────────────────
step "14. Health check"
sleep 6

BACKEND_OK=false
for i in 1 2 3 4 5; do
  if remote "curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1"; then
    BACKEND_OK=true; break
  fi
  sleep 4
done
$BACKEND_OK && ok "Backend healthy" || warn "Backend health check failed — inspect: pm2 logs rison-backend"

if remote "curl -fsS http://127.0.0.1:3000 >/dev/null 2>&1"; then
  ok "Frontend responding"
else
  warn "Frontend not responding — inspect: pm2 logs rison-frontend"
fi

step "15. Boot configuration banner"
remote "pm2 logs rison-backend --lines 80 --nostream 2>/dev/null | grep -E '\\[Config\\]' | tail -5" || \
  warn "Could not read the config banner — check pm2 logs manually."

echo
if $BACKEND_OK; then
  echo "${GRN}╔══════════════════════════════════════════════════════════════════╗${NC}"
  echo "${GRN}║  Deploy complete                                                 ║${NC}"
  echo "${GRN}╚══════════════════════════════════════════════════════════════════╝${NC}"
else
  echo "${YEL}Deploy finished with warnings — verify the services before announcing go-live.${NC}"
fi

cat <<EOF

Next:
  1. Open an assessment link ${YEL}from a phone or another network${NC}.
     Testing from the VPS or your laptop can mask exactly the bug this fixes.
  2. When the deploy looks healthy, clear the portal separately:
       ssh ${VPS_USER}@${VPS_HOST}
       cd ${VPS_APP_DIR}
       npx tsx src/scripts/resetPortalData.ts                    # dry run
       CONFIRM_DESTRUCTIVE_ACTION=YES npx tsx src/scripts/resetPortalData.ts --confirm

Rollback: bash scripts/deploy-remote.sh --rollback
EOF
