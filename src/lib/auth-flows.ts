import type { TokenType } from "@prisma/client";
import { db } from "./db";
import { randomToken, sha256 } from "./crypto";
import { env } from "./env";
import { sendMail, escapeHtml } from "./mail";

const TTL: Record<TokenType, number> = { EMAIL_VERIFY: 48 * 3600_000, PASSWORD_RESET: 3600_000 };

export async function issueToken(userId: string, type: TokenType) {
  // invalidate previous tokens of the same type
  await db.verificationToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
  const token = randomToken(32);
  await db.verificationToken.create({ data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TTL[type]) } });
  return token;
}

export async function consumeToken(token: string, type: TokenType) {
  const row = await db.verificationToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) return null;
  const res = await db.verificationToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  return res.count === 1 ? row.userId : null;
}

export async function sendVerificationEmail(user: { id: string; email: string; name: string }) {
  const token = await issueToken(user.id, "EMAIL_VERIFY");
  const url = `${env.appUrl}/verify-email?token=${token}`;
  return sendMail(
    user.email,
    "Verify your INCONNU SMS account",
    `Welcome, ${user.name}`,
    `Hi ${escapeHtml(user.name)}, please confirm your email address to secure your account.`,
    { label: "Verify email", url },
  );
}

export async function sendPasswordResetEmail(user: { id: string; email: string; name: string }) {
  const token = await issueToken(user.id, "PASSWORD_RESET");
  const url = `${env.appUrl}/reset-password?token=${token}`;
  return sendMail(
    user.email,
    "Reset your INCONNU SMS password",
    "Password reset request",
    "We received a request to reset your password. This link expires in 1 hour. If you did not request it, you can ignore this email.",
    { label: "Reset password", url },
    true,
  );
}
