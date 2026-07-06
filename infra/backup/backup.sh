#!/bin/bash
# One-shot local backup (`npm run backup`).
# docker mode → pg_dump through the running postgres container.
# local mode  → copies the SQLite dev database.
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p backups
STAMP=$(date -u +%Y%m%d-%H%M%S)

if docker compose ps postgres --status running >/dev/null 2>&1 && [ -n "$(docker compose ps -q postgres 2>/dev/null)" ]; then
  echo "→ pg_dump via docker compose"
  docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-monere}" | gzip > "backups/monere-$STAMP.sql.gz"
  echo "✓ backups/monere-$STAMP.sql.gz"
elif [ -f services/auth/prisma/dev.db ]; then
  cp services/auth/prisma/dev.db "backups/monere-sqlite-$STAMP.db"
  echo "✓ backups/monere-sqlite-$STAMP.db"
else
  echo "✗ Nothing to back up (no running postgres, no SQLite dev db)" >&2
  exit 1
fi
