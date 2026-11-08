import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, ipOf, limit, ok, parseJson, withPublic } from "@/lib/http";
import { passwordSchema } from "@/lib/validators";
import { consumeToken } from "@/lib/auth-flows";
import { hashPassword } from "@/lib/password";
import { audit } from "@/lib/audit";

export const POST = withPublic(async (req) => {
  await limit(`reset:${ipOf(req)}`, 10, 3600);
  const { token, password } = await parseJson(req, z.object({ token: z.string().min(10).max(200), password: passwordSchema }));
  const userId = await consumeToken(token, "PASSWORD_RESET");
  if (!userId) throw new HttpError(400, "This reset link is invalid or has expired.", "invalid_token");
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password), emailVerifiedAt: new Date() } }),
    db.session.deleteMany({ where: { userId } }), // log out everywhere
  ]);
  await audit({ actorId: userId, action: "auth.password_reset", entity: "user", entityId: userId, ip: ipOf(req) });
  return ok({ ok: true });
});
