import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { User, VerificationToken } from "../models/index.js";
import { randomCode, randomToken, sha256 } from "../lib/crypto.js";
import { env } from "../config/env.js";
import { sendEmail } from "../lib/mailer.js";

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

let dummyHash: string | null = null;

export async function verifyPassword(pw: string, hash: string | null | undefined) {
  if (!hash) {
    dummyHash ??= await bcrypt.hash("obsydia-timing-equalizer", 12);
    await bcrypt.compare(pw, dummyHash);
    return false;
  }
  return bcrypt.compare(pw, hash);
}

export async function uniqueReferralCode() {
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(5).toString("base64url").replace(/[-_]/g, "").toUpperCase().slice(0, 8);
    if (code.length >= 6 && !(await User.exists({ referralCode: code }))) return code;
  }
  return randomToken(8).toUpperCase();
}

export function publicUser(u: any) {
  return {
    id: String(u._id),
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    emailVerified: u.emailVerified,
    pendingEmail: u.pendingEmail,
    locale: u.locale,
    plan: u.plan,
    planExpiresAt: u.planExpiresAt,
    referralCode: u.referralCode,
    hasPassword: Boolean(u.passwordHash),
    googleLinked: Boolean(u.googleId),
    preferences: u.preferences,
    createdAt: u.createdAt
  };
}

export async function issueVerification(user: any, purpose: "verify_email" | "reset_password" | "change_email", target?: string) {
  await VerificationToken.updateMany({ userId: user._id, purpose, usedAt: null }, { $set: { usedAt: new Date() } });
  const code = randomCode(6);
  const token = randomToken(32);
  await VerificationToken.create({
    userId: user._id,
    purpose,
    codeHash: sha256(`${user._id}:${code}`),
    tokenHash: sha256(token),
    target: target ?? null,
    expiresAt: new Date(Date.now() + 30 * 60_000)
  });
  const base = env().APP_URL;
  const to = target || user.email;
  if (purpose === "verify_email") {
    await sendEmail(to, "verify_email", user.locale, { code, url: `${base}/verify-email?token=${token}` });
  } else if (purpose === "reset_password") {
    await sendEmail(to, "reset_password", user.locale, { url: `${base}/reset-password?token=${token}` });
  } else {
    await sendEmail(to, "change_email", user.locale, { code, url: `${base}/verify-email?token=${token}&change=1` });
  }
  return { code, token };
}

export async function consumeVerification(purpose: string, opts: { token?: string; userId?: unknown; code?: string }) {
  if (opts.token) {
    return VerificationToken.findOneAndUpdate(
      { tokenHash: sha256(opts.token), purpose, usedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } },
      { new: true }
    ).lean<any>();
  }
  if (opts.userId && opts.code) {
    const latest = await VerificationToken.findOne({ userId: opts.userId, purpose, usedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
    if (!latest) return null;
    if (latest.attempts >= 5) {
      latest.usedAt = new Date();
      await latest.save();
      return null;
    }
    if (latest.codeHash !== sha256(`${opts.userId}:${opts.code}`)) {
      await VerificationToken.updateOne({ _id: latest._id }, { $inc: { attempts: 1 } });
      return null;
    }
    return VerificationToken.findOneAndUpdate({ _id: latest._id, usedAt: null }, { $set: { usedAt: new Date() } }, { new: true }).lean<any>();
  }
  return null;
}
