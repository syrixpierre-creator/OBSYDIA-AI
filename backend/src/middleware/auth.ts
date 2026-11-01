import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env, isProd } from "../config/env.js";
import { Session, User } from "../models/index.js";
import { randomToken, safeEqual, sha256 } from "../lib/crypto.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import { ipHash } from "../lib/request.js";

export const SESSION_COOKIE = "obs_session";
export const CSRF_COOKIE = "obs_csrf";

declare global {
  namespace Express {
    interface Request {
      user?: any;
      sessionId?: string;
      apiKey?: any;
    }
  }
}

function cookieBase() {
  return { httpOnly: true, secure: isProd(), sameSite: "lax" as const, path: "/" };
}

export async function createSession(req: Request, res: Response, user: any) {
  const raw = randomToken(32);
  const ttlMs = env().SESSION_TTL_DAYS * 86400_000;
  const session = await Session.create({
    userId: user._id,
    tokenHash: sha256(raw),
    userAgent: String(req.headers["user-agent"] || "").slice(0, 300),
    ipHash: ipHash(req),
    expiresAt: new Date(Date.now() + ttlMs)
  });
  const token = jwt.sign({ sid: String(session._id), uid: String(user._id), sv: user.sessionVersion, t: raw }, env().JWT_SECRET, {
    expiresIn: Math.floor(ttlMs / 1000),
    issuer: "obsydia-ai"
  });
  res.cookie(SESSION_COOKIE, token, { ...cookieBase(), maxAge: ttlMs });
  issueCsrf(res);
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date(), lastActiveAt: new Date() } });
  return session;
}

export function issueCsrf(res: Response) {
  const token = randomToken(24);
  res.cookie(CSRF_COOKIE, token, { httpOnly: false, secure: isProd(), sameSite: "lax", path: "/" });
  return token;
}

export async function destroySession(req: Request, res: Response) {
  if (req.sessionId) await Session.updateOne({ _id: req.sessionId }, { $set: { revokedAt: new Date() } });
  res.clearCookie(SESSION_COOKIE, cookieBase());
}

export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env().JWT_SECRET, { issuer: "obsydia-ai" }) as { sid: string; uid: string; sv: number; t: string };
    const session = await Session.findById(payload.sid).lean<any>();
    if (!session || session.revokedAt || session.expiresAt < new Date()) return next();
    if (!safeEqual(session.tokenHash, sha256(payload.t)) || String(session.userId) !== payload.uid) return next();
    const user = await User.findById(payload.uid);
    if (!user || user.sessionVersion !== payload.sv) return next();
    req.user = user;
    req.sessionId = String(session._id);
    if (!session.lastSeenAt || Date.now() - new Date(session.lastSeenAt).getTime() > 5 * 60_000) {
      void Session.updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date() } }).exec();
      void User.updateOne({ _id: user._id }, { $set: { lastActiveAt: new Date() } }).exec();
    }
  } catch {
    return next();
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized("not_authenticated"));
  if (req.user.status === "suspended") return next(forbidden("account_suspended"));
  next();
}

export function requireVerified(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (!req.user.emailVerified) return next(forbidden("email_not_verified"));
    next();
  });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireVerified(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (req.user.role !== "admin") return next(forbidden("admin_only"));
    next();
  });
}

export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    if (!req.cookies?.[CSRF_COOKIE]) {
      const token = issueCsrf(_res);
      if (req.cookies) req.cookies[CSRF_COOKIE] = token;
    }
    return next();
  }
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.get("x-csrf-token");
  if (!cookie || !header || !safeEqual(String(cookie), String(header))) return next(forbidden("csrf_failed"));
  next();
}
