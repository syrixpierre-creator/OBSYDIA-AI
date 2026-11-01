import rateLimit, { type Options } from "express-rate-limit";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import { Redis } from "ioredis";
import { logger } from "./logger.js";

let redis: Redis | null = null;

export function getRedis() {
  const url = process.env.REDIS_URL || "";
  if (!url) return null;
  if (!redis) {
    redis = new Redis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: true, lazyConnect: false });
    redis.on("error", (err) => logger.warn({ err: err.message }, "redis error"));
  }
  return redis;
}

export async function closeRedis() {
  if (redis) await redis.quit().catch(() => undefined);
  redis = null;
}

export function limiter(name: string, opts: Partial<Options> & { windowMs: number; limit: number | Options["limit"] }) {
  const client = getRedis();
  return rateLimit({
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === "test" && !process.env.TEST_RATE_LIMITS,
    handler: (_req, res) => {
      res.status(429).json({ error: { code: "rate_limited", message: "Too many requests. Please slow down." } });
    },
    ...(client
      ? {
          store: new RedisStore({
            prefix: `obs:rl:${name}:`,
            sendCommand: (command: string, ...args: string[]) => client.call(command, ...args) as Promise<RedisReply>
          })
        }
      : {}),
    ...opts
  });
}
