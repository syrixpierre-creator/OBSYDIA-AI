#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$(readlink -f "$0")")"
FILE="${1:-}"
[[ -n "$FILE" && -f "$FILE" ]] || { echo "Usage: sudo ./restore.sh backups/obsydia-YYYYMMDD-HHMMSS.tar.gz [--with-env] [--yes]" >&2; ls -1t backups/*.tar.gz 2>/dev/null | head -5; exit 1; }
WITH_ENV=0; YES=0
for arg in "${@:2}"; do
  case "$arg" in
    --with-env) WITH_ENV=1 ;;
    --yes) YES=1 ;;
  esac
done
echo "This will REPLACE the current database and uploaded files with the backup:"
echo "  $FILE"
if [[ $YES != 1 ]]; then
  read -r -p "Type RESTORE to continue: " CONFIRM </dev/tty
  [[ "$CONFIRM" == "RESTORE" ]] || { echo "Aborted."; exit 1; }
fi
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
tar -C "$WORK" -xzf "$FILE"
DIR="$(find "$WORK" -maxdepth 1 -type d -name 'obsydia-*' | head -1)"
[[ -f "$DIR/mongo.archive.gz" ]] || { echo "Invalid backup: mongo.archive.gz missing" >&2; exit 1; }
echo "▸ Safety backup of the current state"
./backup.sh --quiet || true
if [[ $WITH_ENV == 1 ]]; then cp "$DIR/env.backup" .env && chmod 600 .env && echo "  .env restored"; fi
docker compose up -d mongo
for i in $(seq 1 30); do docker compose exec -T mongo mongosh --quiet --eval "db.adminCommand('ping').ok" >/dev/null 2>&1 && break; sleep 2; done
docker compose stop app
USER_="$(grep -E '^MONGO_ROOT_USER=' .env | cut -d= -f2- || true)"; USER_="${USER_:-obsydia}"
PASS_="$(grep -E '^MONGO_ROOT_PASSWORD=' .env | cut -d= -f2-)"
echo "▸ Restoring MongoDB"
docker compose exec -T mongo mongorestore --quiet --username "$USER_" --password "$PASS_" --authenticationDatabase admin --drop --gzip --archive --nsInclude 'obsydia.*' <"$DIR/mongo.archive.gz"
echo "▸ Restoring uploads and artifacts"
docker compose run --rm --no-deps -T --entrypoint sh app -c 'find /data -mindepth 1 -delete && tar -C /data -xzf -' <"$DIR/data.tar.gz"
docker compose up -d
for i in $(seq 1 40); do
  docker compose exec -T app node </dev/null -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1 && break
  sleep 3
done
./healthcheck.sh && echo "✓ Restore complete"
