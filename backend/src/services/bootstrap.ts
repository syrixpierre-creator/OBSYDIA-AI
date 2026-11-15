import { env } from "../config/env.js";
import { User } from "../models/index.js";
import { logger } from "../lib/logger.js";
import { normalizeEmail } from "../lib/validate.js";
import { hashPassword, uniqueReferralCode } from "./users.js";
import { ensureBalance } from "./tokens.js";

export async function ensureInitialAdmin() {
  const e = env();
  if (!e.ADMIN_EMAIL) return null;
  const email = e.ADMIN_EMAIL.toLowerCase().trim();
  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role !== "admin") {
      existing.role = "admin";
      await existing.save();
      logger.info({ email }, "promoted existing user to admin");
    }
    return existing;
  }
  if (!e.ADMIN_PASSWORD || e.ADMIN_PASSWORD.length < 12) {
    logger.warn("ADMIN_EMAIL is set but ADMIN_PASSWORD is missing or shorter than 12 characters; admin not created");
    return null;
  }
  const user = await User.create({
    email,
    normalizedEmail: normalizeEmail(email),
    name: e.APP_CREATOR,
    passwordHash: await hashPassword(e.ADMIN_PASSWORD),
    role: "admin",
    emailVerified: true,
    emailVerifiedAt: new Date(),
    plan: "custom",
    referralCode: await uniqueReferralCode()
  });
  await ensureBalance(user._id);
  logger.info({ email }, "initial administrator created");
  return user;
}
