#!/usr/bin/env bash
# Daily database backup (custom format, for pg_restore). Keeps the last 14 days in
# deploy/backups/. Run from cron (see deploy/README.md). Copy backups off this server too.
set -euo pipefail
cd "$(dirname "$0")"

POSTGRES_USER="$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2-)"
POSTGRES_DB="$(grep -E '^POSTGRES_DB=' .env | cut -d= -f2-)"
mkdir -p backups
FILE="backups/db-$(date -u +%Y%m%d-%H%M%S).dump"

docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$FILE"
find backups -name 'db-*.dump' -mtime +14 -delete
echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"
