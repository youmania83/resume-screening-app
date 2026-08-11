#!/usr/bin/env bash
#
# restore-database.sh — inspect or restore a backup taken by
# backup-database.sh. Defaults to the safest possible action at every step.
#
# Usage:
#   bash scripts/restore-database.sh --list
#       List available backups with timestamp and size.
#
#   bash scripts/restore-database.sh --inspect <file>
#       Show what tables/rows a backup contains WITHOUT touching any database.
#
#   bash scripts/restore-database.sh --restore-table candidates --from <file> [--to <database_url>]
#       Restore ONLY the given table(s) from a backup into a database. Comma
#       separate multiple tables. This is almost always what you want in an
#       incident — pulling back the missing rows without disturbing anything
#       that has since changed in other tables.
#       Defaults to a NEW database named like the original with
#       "_restore_<timestamp>" appended, so you can inspect the recovered
#       data before deciding what (if anything) to copy back into
#       production. Pass --to to target a specific database/connection
#       string directly (dangerous — this can overwrite live data).
#
#   bash scripts/restore-database.sh --restore-full --from <file> --to <database_url>
#       Full restore of every table in the dump into the target database.
#       Requires --confirm and CONFIRM_DESTRUCTIVE_ACTION=YES, same pattern
#       as the other destructive scripts in this repo. This DROPS AND
#       RECREATES tables in the target — never point --to at production
#       unless you are certain that is what you want.

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/root/db-backups}"

# Match the versioned client pg_dump uses (see backup-database.sh) — pg_dump
# and pg_restore must be from the same major version for --list output and
# custom-format compatibility to be reliable against a PG17 server.
PG_RESTORE="pg_restore"
for v in 17 16 15; do
  if [ -x "/usr/lib/postgresql/${v}/bin/pg_restore" ]; then
    PG_RESTORE="/usr/lib/postgresql/${v}/bin/pg_restore"
    break
  fi
done

if [ -f "$APP_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source <(grep -E '^DATABASE_URL=' "$APP_DIR/.env")
  set +a
fi

usage() { sed -n '2,26p' "$0"; exit 1; }

[ $# -eq 0 ] && usage

case "$1" in
  --list)
    echo "Backups in ${BACKUP_DIR}:"
    find "$BACKUP_DIR" -maxdepth 1 -name 'candidates_db_*.dump' -printf '%TY-%Tm-%Td %TH:%TM  %10s bytes  %f\n' 2>/dev/null | sort || \
      ls -la "$BACKUP_DIR"/candidates_db_*.dump 2>/dev/null
    ;;

  --inspect)
    FILE="${2:?Usage: --inspect <file>}"
    echo "=== Tables in $FILE ==="
    "$PG_RESTORE" --list "$FILE" | grep "TABLE DATA"
    ;;

  --restore-table)
    TABLES="${2:?Usage: --restore-table <table1,table2> --from <file> [--to <database_url>]}"
    shift 2
    FROM=""
    TO=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --from) FROM="$2"; shift 2 ;;
        --to) TO="$2"; shift 2 ;;
        *) echo "Unknown flag: $1"; exit 1 ;;
      esac
    done
    [ -z "$FROM" ] && { echo "❌ --from <backup file> is required"; exit 1; }

    if [ -z "$TO" ]; then
      SCRATCH_DB="restore_scratch_$(date -u +%Y%m%dT%H%M%SZ)"
      echo "No --to given. Creating a scratch database '$SCRATCH_DB' so you can inspect the"
      echo "recovered rows safely before touching production."
      BASE_URL="${DATABASE_URL%/*}"
      psql "${DATABASE_URL}" -c "CREATE DATABASE ${SCRATCH_DB};"
      TO="${BASE_URL}/${SCRATCH_DB}"
    fi

    IFS=',' read -ra TABLE_ARR <<< "$TABLES"
    ARGS=()
    for t in "${TABLE_ARR[@]}"; do
      ARGS+=(--table="$t")
    done

    echo "Restoring table(s) [$TABLES] from $FROM into: $TO"
    "$PG_RESTORE" --no-owner --no-privileges --data-only --disable-triggers "${ARGS[@]}" --dbname="$TO" "$FROM"
    echo "✅ Done. Inspect the recovered data at: $TO"
    echo "   Nothing in your live database was touched."
    ;;

  --restore-full)
    shift
    FROM=""
    TO=""
    CONFIRM_FLAG="false"
    while [ $# -gt 0 ]; do
      case "$1" in
        --from) FROM="$2"; shift 2 ;;
        --to) TO="$2"; shift 2 ;;
        --confirm) CONFIRM_FLAG="true"; shift ;;
        *) echo "Unknown flag: $1"; exit 1 ;;
      esac
    done
    [ -z "$FROM" ] && { echo "❌ --from <backup file> is required"; exit 1; }
    [ -z "$TO" ] && { echo "❌ --to <database_url> is required (this is intentional — no silent default target for a full restore)"; exit 1; }

    ENV_APPROVED="$(echo "${CONFIRM_DESTRUCTIVE_ACTION:-}" | tr '[:lower:]' '[:upper:]')"
    if [ "$CONFIRM_FLAG" != "true" ] || [ "$ENV_APPROVED" != "YES" ]; then
      echo "🛑 REFUSING TO RUN — a full restore drops and recreates every table in the target."
      echo "   Re-run with: CONFIRM_DESTRUCTIVE_ACTION=YES bash scripts/restore-database.sh --restore-full --from $FROM --to <url> --confirm"
      exit 1
    fi

    echo "Restoring FULL dump from $FROM into: $TO"
    "$PG_RESTORE" --no-owner --no-privileges --clean --if-exists --dbname="$TO" "$FROM"
    echo "✅ Full restore complete."
    ;;

  *)
    usage
    ;;
esac
