#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$(readlink -f "$0")")"
trap 'echo "✗ Update failed at line $LINENO. Your data and .env are untouched; the previous containers keep running if the build failed." >&2' ERR
[[ $EUID -eq 0 ]] || { echo "Run with sudo" >&2; exit 1; }
BRANCH="${OBSYDIA_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
echo "▸ Backing up database before update"
./backup.sh --quiet || echo "! backup failed — continuing"
echo "▸ Fetching latest code ($BRANCH)"
OLD=$(git rev-parse --short HEAD)
git fetch --quiet origin "$BRANCH"
git reset --quiet --hard "origin/$BRANCH"
NEW=$(git rev-parse --short HEAD)
echo "  $OLD → $NEW"
chmod +x ./*.sh
if [[ -n "$(grep -E '^DOMAIN=.+' .env | cut -d= -f2-)" ]]; then
  sed "s|__DOMAIN__|$(grep -E '^DOMAIN=' .env | cut -d= -f2-)|g" infrastructure/caddy/Caddyfile.domain.template >infrastructure/caddy/Caddyfile
else
  cp infrastructure/caddy/Caddyfile.ip.template infrastructure/caddy/Caddyfile
fi
echo "▸ Rebuilding"
docker compose build --pull app
echo "▸ Restarting (volumes are preserved)"
docker compose up -d --remove-orphans
for i in $(seq 1 60); do
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    echo "✓ Update complete — application healthy ($NEW)"
    docker image prune -f >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 3
done
docker compose logs --tail=60 app
echo "✗ Application not healthy after update. Roll back with: git reset --hard $OLD && docker compose up -d --build" >&2
exit 1
