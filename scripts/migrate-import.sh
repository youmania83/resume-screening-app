#!/usr/bin/env bash
#
# migrate-import.sh — restore a bundle produced by migrate-export.sh into
# the database this server's .env points at, then PROVE nothing was lost
# by comparing every table's row count against the manifest recorded at
# export time. Refuses to report success unless every table matches
# exactly.
#
# Usage:
#   # Dry run: shows what would happen, restores nothing
#   bash scripts/migrate-import.sh --bundle /root/migrations/migration-<ts>
#
#   # Approved run
#   CONFIRM_DESTRUCTIVE_ACTION=YES bash scripts/migrate-import.sh \
#       --bundle /root/migrations/migration-<ts> --confirm

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PG_RESTORE="pg_restore"
for v in 17 16 15; do
  if [ -x "/usr/lib/postgresql/${v}/bin/pg_restore" ]; then
    PG_RESTORE="/usr/lib/postgresql/${v}/bin/pg_restore"
    break
  fi
done
PSQL="psql"
for v in 17 16 15; do
  if [ -x "/usr/lib/postgresql/${v}/bin/psql" ]; then
    PSQL="/usr/lib/postgresql/${v}/bin/psql"
    break
  fi
done

BUNDLE=""
CONFIRM_FLAG="false"
while [ $# -gt 0 ]; do
  case "$1" in
    --bundle) BUNDLE="$2"; shift 2 ;;
    --confirm) CONFIRM_FLAG="true"; shift ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

[ -z "$BUNDLE" ] && { echo "❌ --bundle <path> is required"; exit 1; }
[ ! -f "${BUNDLE}/database.dump" ] && { echo "❌ ${BUNDLE}/database.dump not found — is this a valid export bundle?"; exit 1; }
[ ! -f "${BUNDLE}/manifest.json" ] && { echo "❌ ${BUNDLE}/manifest.json not found — cannot verify without it. Refusing to import blind."; exit 1; }

if [ -f "$APP_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source <(grep -E '^DATABASE_URL=' "$APP_DIR/.env")
  set +a
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ This server's .env has no DATABASE_URL set — point it at the target database first."
  exit 1
fi

echo "═══════════════════════════════════════════════════════════════"
echo "  MIGRATION IMPORT"
echo "═══════════════════════════════════════════════════════════════"
echo "Bundle    : $BUNDLE"
echo "Target DB : $(echo "$DATABASE_URL" | sed -E 's#//[^@]*@#//<redacted>@#')"
echo ""
echo "Manifest (recorded at export time):"
cat "${BUNDLE}/manifest.json"
echo ""

ENV_APPROVED="$(echo "${CONFIRM_DESTRUCTIVE_ACTION:-}" | tr '[:lower:]' '[:upper:]')"
if [ "$CONFIRM_FLAG" != "true" ] || [ "$ENV_APPROVED" != "YES" ]; then
  echo "DRY RUN — nothing was restored."
  echo "This will DROP AND RECREATE every table currently in the target database"
  echo "before restoring. Only run this against a database you intend to fully"
  echo "replace with the bundle's contents (a fresh client server's database,"
  echo "not a database with its own live data you want to keep)."
  echo ""
  echo "To proceed:"
  echo "  CONFIRM_DESTRUCTIVE_ACTION=YES bash scripts/migrate-import.sh --bundle $BUNDLE --confirm"
  exit 0
fi

# 1. Restore database
echo "==> 1/3 Restoring database (this drops and recreates tables in the target)..."
"$PG_RESTORE" --no-owner --no-privileges --clean --if-exists --dbname="$DATABASE_URL" "${BUNDLE}/database.dump"
echo "    Restore command finished."

# 2. Restore uploaded files
echo "==> 2/3 Restoring uploaded files..."
if [ -f "${BUNDLE}/uploads.tar.gz" ]; then
  if [ -d "${APP_DIR}/uploads" ] && [ "$(find "${APP_DIR}/uploads" -type f | wc -l | tr -d ' ')" -gt 0 ]; then
    echo "    ⚠️  ${APP_DIR}/uploads already contains files. Extracting on top without"
    echo "       deleting anything already there (same-named files will be overwritten)."
  fi
  tar -xzf "${BUNDLE}/uploads.tar.gz" -C "$APP_DIR"
  RESTORED_FILE_COUNT=$(find "${APP_DIR}/uploads" -type f | wc -l | tr -d ' ')
  echo "    ${RESTORED_FILE_COUNT} file(s) now present in ${APP_DIR}/uploads."
else
  echo "    No uploads.tar.gz in this bundle — nothing to restore."
  RESTORED_FILE_COUNT=0
fi

# 3. Verification: every table's row count in the manifest must match what
# is now actually in the target database. This is the step that actually
# proves "no database lost" instead of just hoping pg_restore worked.
# Actual counts are fetched in ONE query/connection (same reasoning as the
# export step) rather than one psql call per table.
echo "==> 3/3 Verifying restored data against the manifest..."
MANIFEST_FILE_COUNT=$(node -e "console.log(require('${BUNDLE}/manifest.json').uploadedFileCount)" 2>/dev/null || echo "0")

ACTUAL_JSON=$("$PSQL" "$DATABASE_URL" -Atc "
DO \$\$
DECLARE
  r RECORD;
BEGIN
  CREATE TEMP TABLE _migration_actual_counts (table_name text, row_count bigint);
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename LOOP
    EXECUTE format('INSERT INTO _migration_actual_counts SELECT %L, count(*) FROM %I', r.tablename, r.tablename);
  END LOOP;
END \$\$;
SELECT COALESCE(jsonb_object_agg(table_name, row_count), '{}'::jsonb)::text FROM _migration_actual_counts;
" | grep -v '^DO$' | grep -v '^$' | tail -n 1)

FAILED=0
CHECKED=0
DIFF_REPORT=$(node -e "
const expected = require('${BUNDLE}/manifest.json').tableRowCounts;
const actual = JSON.parse(process.argv[1] || '{}');
let checked = 0, failed = 0;
for (const [table, expectedCount] of Object.entries(expected)) {
  checked++;
  const actualCount = actual[table];
  if (actualCount === undefined) {
    console.log(\`FAIL \${table}: expected \${expectedCount} rows, table missing in target\`);
    failed++;
  } else if (Number(actualCount) !== Number(expectedCount)) {
    console.log(\`FAIL \${table}: expected \${expectedCount} rows, found \${actualCount}\`);
    failed++;
  }
}
console.log(\`SUMMARY \${checked} \${failed}\`);
" "$ACTUAL_JSON")

while IFS= read -r line; do
  if [[ "$line" == FAIL* ]]; then
    echo "    ❌ ${line#FAIL }"
  elif [[ "$line" == SUMMARY* ]]; then
    read -r _ CHECKED FAILED <<< "$line"
  fi
done <<< "$DIFF_REPORT"

if [ "$MANIFEST_FILE_COUNT" != "$RESTORED_FILE_COUNT" ]; then
  echo "    ❌ uploaded files: expected ${MANIFEST_FILE_COUNT}, found ${RESTORED_FILE_COUNT}"
  FAILED=$((FAILED + 1))
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
if [ "$FAILED" -eq 0 ]; then
  echo "✅ VERIFIED: all ${CHECKED} table(s) and the uploaded-file count match the"
  echo "   source exactly. Nothing was lost in this migration."
else
  echo "🛑 VERIFICATION FAILED: ${FAILED} mismatch(es) out of ${CHECKED} table(s) checked."
  echo "   Do NOT treat this migration as complete or point production traffic at"
  echo "   this database until every mismatch above is investigated."
  exit 1
fi
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Remember: .env (DATABASE_URL, API keys, SMTP credentials) is NOT part of"
echo "this bundle by design — confirm it was copied to this server separately,"
echo "and that STORAGE_PROVIDER/S3 settings (if not using local storage) point"
echo "at the right place before going live."
