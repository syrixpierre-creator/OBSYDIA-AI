import { db } from "@/lib/db";
import { HttpError, ipOf, limit, ok, parseJson, withPublic } from "@/lib/http";
import { loginSchema } from "@/lib/validators";
import bcrypt from "bcryptjs";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

// constant-time-ish dummy hash to avoid user enumeration through timing
const DUMMY = bcrypt.hashSync("dummy-password-for-timing", 12);

export const POST = withPublic(async (req) => {
  const ip = ipOf(req);
  await limit(`login:${ip}`, 10, 600);
  const { email, password } = await parseJson(req, loginSchema);
  await limit(`login-email:${email}`, 8, 900);
  const user = await db.user.findUnique({ where: { email }, include: { role: true } });
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY);
  if (!user || !valid) {
    await audit({ action: "auth.login_failed", entity: "user", entityId: user?.id, metadata: { email }, ip });
    throw new HttpError(401, "Invalid email or password.", "invalid_credentials");
  }
  if (user.status === "SUSPENDED")
    throw new HttpError(403, `Your account is suspended${user.suspendedReason ? `: ${user.suspendedReason}` : "."}`, "account_suspended");
  await createSession(user.id);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ actorId: user.id, action: "auth.login", entity: "user", entityId: user.id, ip });
  return ok({ ok: true, redirect: user.role.name === "USER" ? "/dashboard" : "/admin" });
});
