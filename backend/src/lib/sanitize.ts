import type { NextFunction, Request, Response } from "express";

function clean(value: unknown, depth = 0): unknown {
  if (depth > 20) return undefined;
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1));
  if (value && typeof value === "object" && !(value instanceof Buffer)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.startsWith("$") || k.includes(".") || k === "__proto__" || k === "constructor" || k === "prototype") continue;
      out[k] = clean(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function mongoSanitize(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) req.body = clean(req.body);
  const q = clean({ ...(req.query as Record<string, unknown>) }) as Record<string, unknown>;
  Object.defineProperty(req, "query", { value: q, writable: true, configurable: true, enumerable: true });
  next();
}
