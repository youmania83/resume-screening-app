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

# ── 2. Connectivity & Remote Preflight ─────────────────────────────────────
step "2. Connectivity & Remote Preflight"

PREFLIGHT_SCRIPT="set -e
test -d '${VPS_APP_DIR}'
test -f '${VPS_APP_DIR}/package.json'
node -v
pm2 -v
cd '${VPS_APP_DIR}'
test -f .env
grep -E '^NEXT_PUBLIC_API_URL=' .env | tail -1 | cut -d= -f2- | tr -d '\"'\\'''
grep -E '^NEXT_PUBLIC_APP_URL=' .env | tail -1 | cut -d= -f2- | tr -d '\"'\\'''
"

PREFLIGHT_OUT="$(remote "$PREFLIGHT_SCRIPT" 2>/dev/null)" || fail "Remote preflight checks failed on ${VPS_USER}@${VPS_HOST}:${VPS_APP_DIR}. Verify path and .env existence."

ok "SSH connection and remote directory verified"

REMOTE_NODE="$(echo "$PREFLIGHT_OUT" | sed -n '1p')"
REMOTE_PM2="$(echo "$PREFLIGHT_OUT" | sed -n '2p')"
REMOTE_API_URL="$(echo "$PREFLIGHT_OUT" | sed -n '3p')"
REMOTE_APP_URL="$(echo "$PREFLIGHT_OUT" | sed -n '4p')"

ok "node ${REMOTE_NODE}, pm2 ${REMOTE_PM2}"
ok "NEXT_PUBLIC_API_URL = ${REMOTE_API_URL}"
ok "NEXT_PUBLIC_APP_URL = ${REMOTE_APP_URL}"

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
pm2 stop all 2>/dev/null || true
rm -rf .next node_modules 2>/dev/null || true
sleep 2
NODE_ENV=development npm ci --include=dev || NODE_ENV=development npm install --include=dev

echo '==> 3/6 Running type checks & regression suite...'
npx tsc --noEmit
npx tsx src/test/verifyPipelineFixes.ts

echo '==> 4/6 Running database migration...'
npm run init-db

echo '==> 5/6 Building production frontend...'
(pkill -9 -f "next" 2>/dev/null || true)
sleep 1
rm -rf .next node_modules/.cache
# --webpack is required here: Next 16 defaults to Turbopack, which fails on
# this VPS with a workspace-root inference error (it climbs above the project
# directory looking for next/package.json and gets confused by the parent
# directory structure). package.json's own \"build\" script already pins
# --webpack for this reason; the deploy script had drifted from it.
npx next build --webpack

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
