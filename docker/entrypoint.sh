#!/bin/sh
set -e
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "▶ Applying database migrations…"
  node node_modules/prisma/build/index.js migrate deploy
  echo "▶ Seeding (roles, super admin, demo provider, settings)…"
  node node_modules/tsx/dist/cli.mjs prisma/seed.ts
fi
exec "$@"
