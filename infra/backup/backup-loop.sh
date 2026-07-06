#!/bin/sh
# Runs inside the `backup` compose sidecar.
# pg_dump every 6 hours, gzip, keep 14 days of snapshots.
set -e
INTERVAL="${BACKUP_INTERVAL_SECONDS:-21600}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

while true; do
  STAMP=$(date -u +%Y%m%d-%H%M%S)
  FILE="/backups/monere-$STAMP.sql.gz"
  echo "[backup] dumping to $FILE"
  pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$FILE"
  echo "[backup] done ($(du -h "$FILE" | cut -f1))"
  find /backups -name 'monere-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete
  sleep "$INTERVAL"
done
