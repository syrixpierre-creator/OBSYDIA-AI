#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$(readlink -f "$0")")"
QUIET=0; [[ "${1:-}" == "--quiet" ]] && QUIET=1
log() { [[ $QUIET == 1 ]] || echo "$@"; }
KEEP="${BACKUP_KEEP:-14}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
DEST="backups/obsydia-$STAMP"
mkdir -p "$DEST"
USER_="$(grep -E '^MONGO_ROOT_USER=' .env | cut -d= -f2- || true)"; USER_="${USER_:-obsydia}"
PASS_="$(grep -E '^MONGO_ROOT_PASSWORD=' .env | cut -d= -f2-)"
log "▸ Dumping MongoDB"
docker compose exec -T mongo mongodump --quiet --username "$USER_" --password "$PASS_" --authenticationDatabase admin --db obsydia --archive --gzip >"$DEST/mongo.archive.gz"
log "▸ Archiving uploads and ZIP artifacts"
docker compose run --rm --no-deps -T --entrypoint sh app -c 'tar -C /data -czf - .' >"$DEST/data.tar.gz"
cp .env "$DEST/env.backup" && chmod 600 "$DEST/env.backup"
tar -C backups -czf "backups/obsydia-$STAMP.tar.gz" "obsydia-$STAMP" && rm -rf "$DEST"
chmod 600 "backups/obsydia-$STAMP.tar.gz"
ls -1t backups/obsydia-*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
log "✓ Backup written to $(pwd)/backups/obsydia-$STAMP.tar.gz ($(du -h "backups/obsydia-$STAMP.tar.gz" | cut -f1))"
log "  Copy it off the server (e.g. scp) — it contains your .env secrets."
