import { NextResponse } from "next/server";
import type { ApiKey, User } from "@prisma/client";
import { db } from "./db";
import { sha256, randomToken } from "./crypto";
import { HttpError, errorResponse, ipOf } from "./http";
import { rateLimit } from "./rate-limit";

export const API_KEY_PREFIX = "isk_live_";

export function generateApiKey() {
  const key = `${API_KEY_PREFIX}${randomToken(24)}`;
  return { key, hash: sha256(key), prefix: key.slice(0, API_KEY_PREFIX.length + 6) };
}

type ApiCtx = { apiKey: ApiKey; user: User };

/**
 * Public API v1 wrapper: Bearer API key auth, per-key rate limit,
 * structured errors and request logging (api_logs).
 */
export function withApiKey<P = Record<string, string>>(handler: (req: Request, ctx: ApiCtx & { params: P }) => Promise<Response>) {
  return async (req: Request, routeCtx: { params: Promise<P> }) => {
    const started = Date.now();
    const url = new URL(req.url);
    let apiKey: ApiKey | null = null;
    let res: Response;
    let rl: Awaited<ReturnType<typeof rateLimit>> | null = null;
    try {
      const auth = req.headers.get("authorization") || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : req.headers.get("x-api-key")?.trim();
      if (!token || !token.startsWith(API_KEY_PREFIX)) throw new HttpError(401, "Missing or malformed API key. Use 'Authorization: Bearer isk_live_…'.", "unauthorized");
      const found = await db.apiKey.findUnique({ where: { keyHash: sha256(token) }, include: { user: true } });
      if (!found || found.revokedAt) throw new HttpError(401, "Invalid or revoked API key.", "unauthorized");
      if (found.user.status !== "ACTIVE") throw new HttpError(403, "Account suspended.", "account_suspended");
      apiKey = found;
      rl = await rateLimit(`api:${found.id}`, found.rateLimitPerMin, 60);
      if (!rl.ok) throw new HttpError(429, `Rate limit exceeded (${found.rateLimitPerMin}/min). Retry in ${rl.resetSeconds}s.`, "rate_limited");
      if (!found.lastUsedAt || Date.now() - found.lastUsedAt.getTime() > 60_000)
        await db.apiKey.update({ where: { id: found.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
      res = await handler(req, { apiKey: found, user: found.user, params: await routeCtx.params });
    } catch (e) {
      res = errorResponse(e);
    }
    if (rl) {
      res.headers.set("X-RateLimit-Limit", String(rl.limit));
      res.headers.set("X-RateLimit-Remaining", String(rl.remaining));
      res.headers.set("X-RateLimit-Reset", String(rl.resetSeconds));
    }
    // Unauthenticated requests are also rate-limited per IP to deter key scanning
    if (!apiKey) {
      const ipRl = await rateLimit(`api-anon:${ipOf(req)}`, 30, 60);
      if (!ipRl.ok) res = NextResponse.json({ error: { code: "rate_limited", message: "Too many requests" } }, { status: 429 });
    }
    void db.apiLog
      .create({
        data: {
          apiKeyId: apiKey?.id,
          userId: apiKey?.userId,
          method: req.method,
          path: url.pathname.slice(0, 255),
          statusCode: res.status,
          ip: ipOf(req),
          durationMs: Date.now() - started,
        },
      })
      .catch(() => {});
    return res;
  };
}
