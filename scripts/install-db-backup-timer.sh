#!/usr/bin/env bash
# install-db-backup-timer.sh — installs/refreshes the systemd timer that runs
# backup-database.sh every 4 hours. Idempotent: safe to re-run on every
# deploy (e.g. from deploy-remote.sh) so unit file edits take effect.
#
# Run on the VPS as root: bash scripts/install-db-backup-timer.sh

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

chmod +x "$APP_DIR/scripts/backup-database.sh" "$APP_DIR/scripts/restore-database.sh"

cp "$APP_DIR/scripts/resume-db-backup.service" /etc/systemd/system/resume-db-backup.service
cp "$APP_DIR/scripts/resume-db-backup.timer" /etc/systemd/system/resume-db-backup.timer

mkdir -p /root/db-backups

systemctl daemon-reload
systemctl enable --now resume-db-backup.timer

echo "✅ resume-db-backup.timer installed and active."
systemctl list-timers resume-db-backup.timer --no-pager
