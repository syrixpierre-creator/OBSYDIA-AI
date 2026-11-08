# syntax=docker/dockerfile:1.7
# ---------- deps ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npx next build

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runner
# bookworm-slim already ships libssl3 (required by Prisma) — no apt needed
RUN groupadd -r app && useradd -r -g app -d /app app
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# Next standalone server
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# Prisma CLI + schema/migrations/seed for the entrypoint (migrate deploy + seed)
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/scripts ./scripts
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server.js"]
