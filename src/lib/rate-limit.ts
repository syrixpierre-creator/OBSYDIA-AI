import Redis from "ioredis";
import { env } from "./env";

type Result = { ok: boolean; remaining: number; resetSeconds: number; limit: number };

let redis: Redis | null | undefined;
function getRedis() {
  if (redis !== undefined) return redis;
  if (!env.redisUrl) return (redis = null);
  redis = new Redis(env.redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
  redis.on("error", (e) => console.error("[redis]", e.message));
  return redis;
}

const memory = new Map<string, { count: number; reset: number }>();

/** Fixed-window rate limiter. Uses Redis when REDIS_URL is set (multi-instance safe), memory otherwise. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<Result> {
  const r = getRedis();
  const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
  if (r && r.status === "ready") {
    try {
      const count = await r.incr(bucket);
      if (count === 1) await r.expire(bucket, windowSeconds);
      const ttl = await r.ttl(bucket);
      return { ok: count <= limit, remaining: Math.max(0, limit - count), resetSeconds: ttl, limit };
    } catch {
      /* fall through to memory */
    }
  }
  const now = Date.now();
  const entry = memory.get(bucket);
  if (!entry || entry.reset < now) {
    memory.set(bucket, { count: 1, reset: now + windowSeconds * 1000 });
    if (memory.size > 50_000) for (const [k, v] of memory) if (v.reset < now) memory.delete(k);
    return { ok: true, remaining: limit - 1, resetSeconds: windowSeconds, limit };
  }
  entry.count++;
  return {
    ok: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetSeconds: Math.ceil((entry.reset - now) / 1000),
    limit,
  };
}
