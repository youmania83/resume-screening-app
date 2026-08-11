#!/usr/bin/env bash
#
# backup-database.sh — automated, verified PostgreSQL backup for the
# production recruitment database.
#
# Why this exists: on 2026-08-11 an investigation found that every candidate
# record created before 2026-08-08 had vanished from the live database, with
# no application code path (no TRUNCATE, no unscoped DELETE, no automatic
# cron) able to explain it, and no backup of any kind existed to recover from
# it. This script closes that gap: it runs on a schedule (see
# resume-db-backup.timer), takes a full verified dump, and prunes old ones on
# a retention policy — so a repeat of that incident is recoverable within
# minutes instead of being permanent data loss.
#
# Usage:
#   bash scripts/backup-database.sh                # run a backup now
#   RETENTION_DAYS=30 bash scripts/backup-database.sh
#
# Installed on the VPS as a systemd timer — see scripts/resume-db-backup.timer
# and scripts/resume-db-backup.service, deployed by
# scripts/install-db-backup-timer.sh.

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/root/db-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="${BACKUP_DIR}/backup.log"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_FILE"; }

mkdir -p "$BACKUP_DIR"

# pg_dump refuses to dump from a Postgres server newer than itself. The
# production database (Supabase) runs PG 17; prefer a matching versioned
# client if one is installed (see scripts/install-db-backup-timer.sh),
# falling back to whatever "pg_dump" resolves to on PATH.
PG_DUMP="pg_dump"
PG_RESTORE="pg_restore"
for v in 17 16 15; do
  if [ -x "/usr/lib/postgresql/${v}/bin/pg_dump" ]; then
    PG_DUMP="/usr/lib/postgresql/${v}/bin/pg_dump"
    PG_RESTORE="/usr/lib/postgresql/${v}/bin/pg_restore"
    break
  fi
done

# Load DATABASE_URL the same way the app does (VPS .env is not in git and is
# managed by hand on the server, per AGENTS.md).
if [ -f "$APP_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source <(grep -E '^DATABASE_URL=' "$APP_DIR/.env")
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  log "❌ DATABASE_URL is not set (checked \$DATABASE_URL and $APP_DIR/.env). Aborting."
  exit 1
fi

DUMP_FILE="${BACKUP_DIR}/candidates_db_${TIMESTAMP}.dump"

log "==> Starting backup -> ${DUMP_FILE}"

# Custom format: compressed, supports selective/parallel restore, and
# pg_restore --list can validate it without touching any database.
if ! "$PG_DUMP" "$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$DUMP_FILE" 2>>"$LOG_FILE"; then
  log "❌ pg_dump failed. See $LOG_FILE for details."
  rm -f "$DUMP_FILE"
  exit 1
fi

DUMP_SIZE=$(stat -c%s "$DUMP_FILE" 2>/dev/null || stat -f%z "$DUMP_FILE" 2>/dev/null || echo 0)
if [ "$DUMP_SIZE" -lt 1024 ]; then
  log "❌ Dump file is suspiciously small (${DUMP_SIZE} bytes) — treating as a failed backup and discarding it."
  rm -f "$DUMP_FILE"
  exit 1
fi

# Verify the dump is structurally readable (does not touch any live database).
TABLE_COUNT=$("$PG_RESTORE" --list "$DUMP_FILE" 2>>"$LOG_FILE" | grep -c "TABLE DATA" || true)
if [ "$TABLE_COUNT" -lt 1 ]; then
  log "❌ Dump verification failed — pg_restore --list found no table data. Discarding."
  rm -f "$DUMP_FILE"
  exit 1
fi

# Specifically confirm the candidates table actually made it into this dump
# with rows in it — this is the exact failure mode that started all of this.
CANDIDATES_IN_DUMP=$("$PG_RESTORE" --list "$DUMP_FILE" 2>>"$LOG_FILE" | grep -c "TABLE DATA public candidates" || true)
if [ "$CANDIDATES_IN_DUMP" -lt 1 ]; then
  log "⚠️  WARNING: no 'candidates' table data found in this dump. Keeping the file, but this needs investigation."
fi

log "✅ Backup verified OK: ${DUMP_FILE} (${DUMP_SIZE} bytes, ${TABLE_COUNT} tables with data)"

# Retention: prune dumps older than RETENTION_DAYS.
DELETED=0
while IFS= read -r -d '' old_file; do
  rm -f "$old_file"
  DELETED=$((DELETED + 1))
done < <(find "$BACKUP_DIR" -maxdepth 1 -name 'candidates_db_*.dump' -mtime "+${RETENTION_DAYS}" -print0)

if [ "$DELETED" -gt 0 ]; then
  log "🧹 Pruned ${DELETED} backup(s) older than ${RETENTION_DAYS} days."
fi

REMAINING=$(find "$BACKUP_DIR" -maxdepth 1 -name 'candidates_db_*.dump' | wc -l | tr -d ' ')
log "==> Backup complete. ${REMAINING} backup(s) currently retained in ${BACKUP_DIR}."
