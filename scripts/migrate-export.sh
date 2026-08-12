#!/usr/bin/env bash
#
# migrate-export.sh — bundle everything needed to move this app to a new
# (e.g. client-owned) server with zero data loss: the full database, every
# uploaded file, and a manifest recording exactly what should be there so
# the import step on the other end can PROVE nothing went missing instead
# of just assuming it.
#
# What it does NOT do: touch .env. That file holds live credentials
# (DATABASE_URL, API keys, SMTP passwords) and is deliberately never
# bundled, logged, or transferred by this script. Copy it yourself over a
# secure channel (scp directly server-to-server, not through this bundle,
# not through git, not pasted into chat).
#
# Usage:
#   bash scripts/migrate-export.sh
#   OUTPUT_DIR=/root/migrations bash scripts/migrate-export.sh
#
# Produces: <OUTPUT_DIR>/migration-<timestamp>/
#   ├── database.dump       (pg_dump custom format, schema + data)
#   ├── uploads.tar.gz      (every locally-stored file)
#   └── manifest.json       (per-table row counts, file count/checksum,
#                             source host, timestamp -- the import step
#                             verifies against this)

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${OUTPUT_DIR:-/root/migrations}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BUNDLE_DIR="${OUTPUT_DIR}/migration-${TIMESTAMP}"

PG_DUMP="pg_dump"
for p in "/opt/homebrew/opt/postgresql@17/bin/pg_dump" "/usr/local/opt/postgresql@17/bin/pg_dump"; do
  if [ -x "$p" ]; then
    PG_DUMP="$p"
    break
  fi
done
if [ "$PG_DUMP" = "pg_dump" ]; then
  for v in 17 16 15; do
    if [ -x "/usr/lib/postgresql/${v}/bin/pg_dump" ]; then
      PG_DUMP="/usr/lib/postgresql/${v}/bin/pg_dump"
      break
    fi
  done
fi

PSQL="psql"
for p in "/opt/homebrew/opt/postgresql@17/bin/psql" "/usr/local/opt/postgresql@17/bin/psql"; do
  if [ -x "$p" ]; then
    PSQL="$p"
    break
  fi
done
if [ "$PSQL" = "psql" ]; then
  for v in 17 16 15; do
    if [ -x "/usr/lib/postgresql/${v}/bin/psql" ]; then
      PSQL="/usr/lib/postgresql/${v}/bin/psql"
      break
    fi
  done
fi

if [ -z "${DATABASE_URL:-}" ] && [ -f "$APP_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source <(grep -E '^DATABASE_URL=' "$APP_DIR/.env")
  set +a
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ DATABASE_URL is not set. Aborting."
  exit 1
fi

mkdir -p "$BUNDLE_DIR"
echo "═══════════════════════════════════════════════════════════════"
echo "  MIGRATION EXPORT"
echo "═══════════════════════════════════════════════════════════════"
echo "Bundle    : $BUNDLE_DIR"
echo "Source DB : $(echo "$DATABASE_URL" | sed -E 's#//[^@]*@#//<redacted>@#')"
echo ""

# 1. Per-table row counts, taken BEFORE the dump, not after. This is the
# baseline the import step's verification will require the target to meet
# or exceed. On a live source database, a high-churn table (activity/audit
# logs) keeps growing while pg_dump runs; counting first means that growth
# only ever makes the dump contain >= this baseline, never <. Counting
# after the dump (the original approach) can make an actively-written
# table's live count run ahead of what actually made it into the dump
# file, which then reads as "data lost" during verification when nothing
# was actually lost -- confirmed by a real test run on this database.
# Done as ONE query in ONE connection (dynamic SQL building a JSON object
# server-side) -- looping psql once per table here meant 100+ sequential
# round trips to a remote pooler, slow enough to time out and risking the
# pooler's connection limit.
echo "==> 1/3 Recording per-table row counts (baseline, taken before the dump)..."
# psql -c with multiple ;-separated statements echoes a completion tag
# ("DO") for the DO block ahead of the actual SELECT output even with -t,
# so take only the last non-empty line -- the JSON from the final SELECT.
TABLE_JSON=$("$PSQL" "$DATABASE_URL" -Atc "
DO \$\$
DECLARE
  r RECORD;
BEGIN
  CREATE TEMP TABLE _migration_counts (table_name text, row_count bigint);
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename LOOP
    EXECUTE format('INSERT INTO _migration_counts SELECT %L, count(*) FROM %I', r.tablename, r.tablename);
  END LOOP;
END \$\$;
SELECT COALESCE(jsonb_object_agg(table_name, row_count), '{}'::jsonb)::text FROM _migration_counts;
" | grep -v '^DO$' | grep -v '^$' | tail -n 1)
TABLE_COUNT_N=$(echo "$TABLE_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(Object.keys(JSON.parse(d)).length));")
echo "    ${TABLE_COUNT_N} tables recorded."

# 2. Database dump
echo "==> 2/3 Dumping database..."
"$PG_DUMP" "$DATABASE_URL" --format=custom --no-owner --no-privileges --file="${BUNDLE_DIR}/database.dump"
DUMP_SIZE=$(stat -c%s "${BUNDLE_DIR}/database.dump" 2>/dev/null || stat -f%z "${BUNDLE_DIR}/database.dump" 2>/dev/null || echo 0)
if [ "$DUMP_SIZE" -lt 1024 ]; then
  echo "❌ Database dump is suspiciously small (${DUMP_SIZE} bytes). Aborting export."
  exit 1
fi
echo "    $(du -h "${BUNDLE_DIR}/database.dump" | cut -f1) written."

# 3. Uploaded files (local storage only -- if STORAGE_PROVIDER is set to
# something else in .env, e.g. s3, that provider's own bucket already
# survives a server move untouched and there is nothing to bundle here).
echo "==> 3/3 Archiving uploaded files..."
UPLOADS_DIR="${APP_DIR}/uploads"
FILE_COUNT=0
FILES_SIZE=0
if [ -d "$UPLOADS_DIR" ]; then
  FILE_COUNT=$(find "$UPLOADS_DIR" -type f | wc -l | tr -d ' ')
  tar -czf "${BUNDLE_DIR}/uploads.tar.gz" -C "$APP_DIR" uploads
  FILES_SIZE=$(stat -c%s "${BUNDLE_DIR}/uploads.tar.gz" 2>/dev/null || stat -f%z "${BUNDLE_DIR}/uploads.tar.gz" 2>/dev/null || echo 0)
  echo "    ${FILE_COUNT} file(s), $(du -h "${BUNDLE_DIR}/uploads.tar.gz" | cut -f1) archived."
else
  echo "    No local uploads/ directory found — skipping (check STORAGE_PROVIDER if this is unexpected)."
fi

# Manifest — the import step's source of truth for verification.
cat > "${BUNDLE_DIR}/manifest.json" <<EOF
{
  "exportedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "sourceHost": "$(hostname)",
  "databaseDumpSizeBytes": ${DUMP_SIZE},
  "tableRowCounts": ${TABLE_JSON},
  "uploadedFileCount": ${FILE_COUNT},
  "uploadsArchiveSizeBytes": ${FILES_SIZE}
}
EOF

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ Export complete: $BUNDLE_DIR"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Copy the WHOLE bundle directory to the new server, e.g.:"
echo "       scp -r ${BUNDLE_DIR} newuser@newserver:/root/migrations/"
echo "  2. Copy .env separately, over a secure channel, e.g.:"
echo "       scp ${APP_DIR}/.env newuser@newserver:/root/resume-screening-app/.env"
echo "     (never inside the migration bundle, never via git)"
echo "  3. On the new server, with the app code already deployed and its"
echo "     own DATABASE_URL pointed at the target database, run:"
echo "       bash scripts/migrate-import.sh --bundle <path-to-bundle> --confirm"
