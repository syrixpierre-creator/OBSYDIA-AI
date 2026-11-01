import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { Session, User } from "../models/index.js";
import { body, email as emailSchema, normalizeEmail, password as passwordSchema } from "../lib/validate.js";
import { badRequest, conflict, forbidden, unauthorized, AppError } from "../lib/errors.js";
import { createSession, destroySession, issueCsrf, requireAuth } from "../middleware/auth.js";
import { limiter } from "../lib/rateLimit.js";
import { ipHash } from "../lib/request.js";
import { consumeVerification, hashPassword, issueVerification, publicUser, uniqueReferralCode, verifyPassword } from "../services/users.js";
import { qualifyReferral, recordReferral } from "../services/referrals.js";
import { ensureBalance } from "../services/tokens.js";
import { sendEmail } from "../lib/mailer.js";
import { audit } from "../lib/audit.js";
import { randomToken, signPayload, verifyPayload } from "../lib/crypto.js";

export const authRouter = Router();

const authLimiter = limiter("auth", { windowMs: 15 * 60_000, limit: 20 });
const strictLimiter = limiter("auth-strict", { windowMs: 60 * 60_000, limit: 8 });

authRouter.get("/me", (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

authRouter.get("/csrf", (_req, res) => {
  res.json({ csrfToken: issueCsrf(res) });
});

authRouter.post("/signup", strictLimiter, async (req, res) => {
  const input = body(
    req,
    z.object({
      name: z.string().trim().min(2).max(80),
      email: emailSchema,
      password: passwordSchema,
      locale: z.enum(["en", "fr"]).optional(),
      ref: z.string().trim().max(32).optional(),
      website: z.string().max(0).optional()
    })
  );
  const normalized = normalizeEmail(input.email);
  if (await User.exists({ $or: [{ email: input.email }, { normalizedEmail: normalized }] })) {
    throw conflict("email_taken", "An account already exists with this email");
  }
  const user = await User.create({
    email: input.email,
    normalizedEmail: normalized,
    name: input.name,
    passwordHash: await hashPassword(input.password),
    locale: input.locale || "en",
    referralCode: await uniqueReferralCode(),
    signupIpHash: ipHash(req)
  });
  await recordReferral(user, input.ref);
  await ensureBalance(user._id);
  await issueVerification(user, "verify_email");
  await createSession(req, res, user);
  await audit(req, "auth.signup", { actorId: user._id });
  res.status(201).json({ user: publicUser(user) });
});

async function markVerified(user: any) {
  if (user.emailVerified) return;
  await User.updateOne({ _id: user._id }, { $set: { emailVerified: true, emailVerifiedAt: new Date() } });
  await qualifyReferral(user._id);
  void sendEmail(user.email, "welcome", user.locale, { name: user.name, url: `${env().APP_URL}/app` });
}

authRouter.post("/verify-email", authLimiter, async (req, res) => {
  const input = body(req, z.object({ code: z.string().regex(/^\d{6}$/).optional(), token: z.string().min(20).max(200).optional() }));
  if (input.token) {
    const record = await consumeVerification("verify_email", { token: input.token });
    if (record) {
      const user = await User.findById(record.userId);
      if (!user) throw badRequest("invalid_token");
      await markVerified(user);
      return res.json({ ok: true, purpose: "verify_email" });
    }
    const change = await consumeVerification("change_email", { token: input.token });
    if (change) {
      await applyEmailChange(change.userId, change.target);
      return res.json({ ok: true, purpose: "change_email" });
    }
    throw badRequest("invalid_or_expired_code", "This link is invalid or has expired");
  }
  if (!req.user) throw unauthorized("not_authenticated");
  if (!input.code) throw badRequest("code_required");
  const record = await consumeVerification("verify_email", { userId: req.user._id, code: input.code });
  if (!record) throw badRequest("invalid_or_expired_code", "The code is invalid or has expired");
  await markVerified(req.user);
  const fresh = await User.findById(req.user._id);
  res.json({ ok: true, user: publicUser(fresh) });
});

authRouter.post("/resend-verification", requireAuth, strictLimiter, async (req, res) => {
  if (req.user.emailVerified) return res.json({ ok: true });
  await issueVerification(req.user, "verify_email");
  res.json({ ok: true });
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const input = body(req, z.object({ email: emailSchema, password: z.string().min(1).max(200) }));
  const user = await User.findOne({ email: input.email });
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(429, "account_locked", "Too many failed attempts. Try again later.", { until: user.lockedUntil });
  }
  const ok = await verifyPassword(input.password, user?.passwordHash);
  if (!user || !ok) {
    if (user) {
      const failures = (user.failedLogins || 0) + 1;
      await User.updateOne(
        { _id: user._id },
        { $set: { failedLogins: failures, lockedUntil: failures >= 8 ? new Date(Date.now() + 15 * 60_000) : null } }
      );
      await audit(req, "auth.login_failed", { actorId: user._id });
    }
    throw unauthorized("invalid_credentials", "Incorrect email or password");
  }
  if (user.status === "suspended") throw forbidden("account_suspended", "This account is suspended");
  await User.updateOne({ _id: user._id }, { $set: { failedLogins: 0, lockedUntil: null } });
  await createSession(req, res, user);
  await audit(req, "auth.login", { actorId: user._id });
  res.json({ user: publicUser(user) });
});

authRouter.post("/logout", async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
});

authRouter.post("/forgot-password", strictLimiter, async (req, res) => {
  const input = body(req, z.object({ email: emailSchema }));
  const user = await User.findOne({ email: input.email });
  if (user && user.status === "active") await issueVerification(user, "reset_password");
  res.json({ ok: true });
});

authRouter.post("/reset-password", authLimiter, async (req, res) => {
  const input = body(req, z.object({ token: z.string().min(20).max(200), password: passwordSchema }));
  const record = await consumeVerification("reset_password", { token: input.token });
  if (!record) throw badRequest("invalid_or_expired_code", "This link is invalid or has expired");
  await User.updateOne(
    { _id: record.userId },
    { $set: { passwordHash: await hashPassword(input.password), failedLogins: 0, lockedUntil: null, emailVerified: true }, $inc: { sessionVersion: 1 } }
  );
  await Session.updateMany({ userId: record.userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  await audit(req, "auth.password_reset", { actorId: record.userId });
  res.json({ ok: true });
});

authRouter.post("/change-password", requireAuth, authLimiter, async (req, res) => {
  const input = body(req, z.object({ currentPassword: z.string().max(200).optional(), newPassword: passwordSchema }));
  if (req.user.passwordHash && !(await verifyPassword(input.currentPassword || "", req.user.passwordHash))) {
    throw unauthorized("invalid_credentials", "Current password is incorrect");
  }
  await User.updateOne({ _id: req.user._id }, { $set: { passwordHash: await hashPassword(input.newPassword) }, $inc: { sessionVersion: 1 } });
  await Session.updateMany({ userId: req.user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  const fresh = await User.findById(req.user._id);
  await createSession(req, res, fresh);
  await audit(req, "auth.password_changed");
  res.json({ ok: true });
});

authRouter.post("/change-email", requireAuth, strictLimiter, async (req, res) => {
  const input = body(req, z.object({ newEmail: emailSchema, password: z.string().max(200).optional() }));
  if (req.user.passwordHash && !(await verifyPassword(input.password || "", req.user.passwordHash))) {
    throw unauthorized("invalid_credentials", "Password is incorrect");
  }
  if (await User.exists({ $or: [{ email: input.newEmail }, { normalizedEmail: normalizeEmail(input.newEmail) }] })) {
    throw conflict("email_taken", "This email is already in use");
  }
  await User.updateOne({ _id: req.user._id }, { $set: { pendingEmail: input.newEmail } });
  await issueVerification(req.user, "change_email", input.newEmail);
  res.json({ ok: true });
});

async function applyEmailChange(userId: unknown, target: string) {
  if (await User.exists({ email: target, _id: { $ne: userId } })) throw conflict("email_taken");
  await User.updateOne(
    { _id: userId },
    { $set: { email: target, normalizedEmail: normalizeEmail(target), pendingEmail: null, emailVerified: true } }
  );
}

authRouter.post("/confirm-email-change", requireAuth, authLimiter, async (req, res) => {
  const input = body(req, z.object({ code: z.string().regex(/^\d{6}$/) }));
  const record = await consumeVerification("change_email", { userId: req.user._id, code: input.code });
  if (!record) throw badRequest("invalid_or_expired_code", "The code is invalid or has expired");
  await applyEmailChange(req.user._id, record.target);
  await audit(req, "auth.email_changed");
  res.json({ ok: true, user: publicUser(await User.findById(req.user._id)) });
});

authRouter.patch("/profile", requireAuth, async (req, res) => {
  const input = body(
    req,
    z.object({
      name: z.string().trim().min(2).max(80).optional(),
      locale: z.enum(["en", "fr"]).optional(),
      aiLanguage: z.enum(["auto", "en", "fr"]).optional()
    })
  );
  const set: Record<string, unknown> = {};
  if (input.name) set.name = input.name;
  if (input.locale) set.locale = input.locale;
  if (input.aiLanguage) set["preferences.aiLanguage"] = input.aiLanguage;
  await User.updateOne({ _id: req.user._id }, { $set: set });
  res.json({ user: publicUser(await User.findById(req.user._id)) });
});

authRouter.get("/sessions", requireAuth, async (req, res) => {
  const sessions = await Session.find({ userId: req.user._id, revokedAt: null, expiresAt: { $gt: new Date() } })
    .sort({ lastSeenAt: -1 })
    .limit(20)
    .lean<any[]>();
  res.json({
    sessions: sessions.map((s) => ({ id: String(s._id), userAgent: s.userAgent, lastSeenAt: s.lastSeenAt, createdAt: s.createdAt, current: String(s._id) === req.sessionId }))
  });
});

authRouter.delete("/sessions/:id", requireAuth, async (req, res) => {
  await Session.updateOne({ _id: String(req.params.id), userId: req.user._id }, { $set: { revokedAt: new Date() } });
  res.json({ ok: true });
});

authRouter.get("/google", (req, res) => {
  const e = env();
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) return res.redirect("/login?error=google_not_configured");
  const nonce = randomToken(16);
  const state = signPayload({ n: nonce, ref: String(req.query.ref || "").slice(0, 32) }, 600, "oauth");
  res.cookie("obs_oauth", nonce, { httpOnly: true, sameSite: "lax", secure: e.APP_URL.startsWith("https://"), maxAge: 600_000, path: "/api/auth" });
  const params = new URLSearchParams({
    client_id: e.GOOGLE_CLIENT_ID,
    redirect_uri: `${e.APP_URL}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account"
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

authRouter.get("/google/callback", authLimiter, async (req, res) => {
  const e = env();
  const state = verifyPayload<{ n: string; ref: string }>(String(req.query.state || ""), "oauth");
  if (!state || state.n !== req.cookies?.obs_oauth || !req.query.code) return res.redirect("/login?error=oauth_failed");
  res.clearCookie("obs_oauth", { path: "/api/auth" });
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: String(req.query.code),
      client_id: e.GOOGLE_CLIENT_ID,
      client_secret: e.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${e.APP_URL}/api/auth/google/callback`,
      grant_type: "authorization_code"
    })
  });
  if (!tokenRes.ok) return res.redirect("/login?error=oauth_failed");
  const tokens: any = await tokenRes.json();
  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${tokens.access_token}` } });
  if (!infoRes.ok) return res.redirect("/login?error=oauth_failed");
  const info: any = await infoRes.json();
  if (!info.email || !info.email_verified) return res.redirect("/login?error=oauth_email_unverified");
  const address = String(info.email).toLowerCase();
  let user = await User.findOne({ $or: [{ googleId: info.sub }, { email: address }] });
  if (user && user.status === "suspended") return res.redirect("/login?error=account_suspended");
  if (!user) {
    user = await User.create({
      email: address,
      normalizedEmail: normalizeEmail(address),
      name: String(info.name || address.split("@")[0]).slice(0, 80),
      googleId: info.sub,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      locale: "en",
      referralCode: await uniqueReferralCode(),
      signupIpHash: ipHash(req)
    });
    await recordReferral(user, state.ref || undefined);
    await qualifyReferral(user._id);
    await ensureBalance(user._id);
    void sendEmail(user.email, "welcome", user.locale, { name: user.name, url: `${e.APP_URL}/app` });
  } else if (!user.googleId) {
    await User.updateOne({ _id: user._id }, { $set: { googleId: info.sub, emailVerified: true } });
    if (!user.emailVerified) await qualifyReferral(user._id);
  }
  await createSession(req, res, user);
  await audit(req, "auth.google_login", { actorId: user._id });
  res.redirect("/app");
});
