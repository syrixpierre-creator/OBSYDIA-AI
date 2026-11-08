import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { getCurrentUser, isAdminRole, type CurrentUser } from "./auth";
import { env } from "./env";
import { rateLimit } from "./rate-limit";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = "error", public details?: unknown) {
    super(message);
  }
}

export const ok = (data: unknown, init?: number | ResponseInit) =>
  NextResponse.json(data, typeof init === "number" ? { status: init } : init);

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) {
    return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
  }
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "validation_error", message: e.issues[0]?.message ?? "Invalid input", details: e.flatten().fieldErrors } },
      { status: 422 },
    );
  }
  console.error("[api] unhandled error", e);
  return NextResponse.json({ error: { code: "internal_error", message: "An unexpected error occurred." } }, { status: 500 });
}

export async function parseJson<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body", "invalid_json");
  }
  return schema.parse(body);
}

export function ipOf(req: Request) {
  return (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown").slice(0, 64);
}

/**
 * CSRF protection for cookie-authenticated mutations: the Origin (or Referer) must match APP_URL / Host.
 * Combined with SameSite=Lax cookies this blocks cross-site form/fetch submissions.
 */
export function assertSameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin") || req.headers.get("referer");
  if (!origin) throw new HttpError(403, "Missing origin", "csrf");
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    throw new HttpError(403, "Invalid origin", "csrf");
  }
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const allowed = new Set([new URL(env.appUrl).host, host].filter(Boolean));
  if (!allowed.has(o.host)) throw new HttpError(403, "Cross-site request blocked", "csrf");
}

export async function limit(key: string, max: number, windowSec: number) {
  const r = await rateLimit(key, max, windowSec);
  if (!r.ok) throw new HttpError(429, `Too many requests. Retry in ${r.resetSeconds}s.`, "rate_limited");
}

type Handler<C> = (req: Request, ctx: C & { user: CurrentUser }) => Promise<Response>;

/** Wrap a session-authenticated route handler with CSRF, auth, role and error handling. */
export function withUser<C = { params: Promise<Record<string, string>> }>(handler: Handler<C>, opts: { admin?: boolean; superAdmin?: boolean } = {}) {
  return async (req: Request, ctx: C) => {
    try {
      assertSameOrigin(req);
      const user = await getCurrentUser();
      if (!user) throw new HttpError(401, "Authentication required", "unauthorized");
      if (opts.admin && !isAdminRole(user.role)) throw new HttpError(403, "Admin access required", "forbidden");
      if (opts.superAdmin && user.role !== "SUPER_ADMIN") throw new HttpError(403, "Super admin access required", "forbidden");
      return await handler(req, { ...ctx, user });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function withPublic<C = { params: Promise<Record<string, string>> }>(handler: (req: Request, ctx: C) => Promise<Response>, opts: { csrf?: boolean } = { csrf: true }) {
  return async (req: Request, ctx: C) => {
    try {
      if (opts.csrf !== false) assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
