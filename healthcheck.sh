#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$(readlink -f "$0")")"
URL="${1:-}"
if [[ -z "$URL" ]]; then URL="$(grep -E '^APP_URL=' .env 2>/dev/null | cut -d= -f2-)"; fi
FAIL=0
printf 'Containers\n'
docker compose ps --format '  {{.Service}}\t{{.State}}\t{{.Health}}' 2>/dev/null || { echo "  docker compose not available"; FAIL=1; }
printf '\nApplication (internal)\n'
if docker compose exec -T app node </dev/null -e "fetch('http://127.0.0.1:8080/health').then(async r=>{console.log('  '+r.status+' '+await r.text());process.exit(r.ok?0:1)}).catch(e=>{console.log('  '+e.message);process.exit(1)})"; then :; else FAIL=1; fi
if [[ -n "$URL" ]]; then
  printf '\nPublic endpoint %s/health\n' "$URL"
  if OUT="$(curl -fsS --max-time 10 "$URL/health")"; then echo "  $OUT"; else echo "  unreachable"; FAIL=1; fi
fi
printf '\nDisk\n'; df -h / | tail -1 | awk '{print "  used " $3 " of " $2 " (" $5 ")"}'
exit $FAIL
