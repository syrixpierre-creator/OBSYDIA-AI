import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, ipOf, limit, ok, parseJson, withPublic } from "@/lib/http";
import { consumeToken } from "@/lib/auth-flows";
import { audit } from "@/lib/audit";

export const POST = withPublic(async (req) => {
  await limit(`verify:${ipOf(req)}`, 20, 600);
  const { token } = await parseJson(req, z.object({ token: z.string().min(10).max(200) }));
  const userId = await consumeToken(token, "EMAIL_VERIFY");
  if (!userId) throw new HttpError(400, "This verification link is invalid or has expired.", "invalid_token");
  await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  await audit({ actorId: userId, action: "auth.email_verified", entity: "user", entityId: userId });
  return ok({ ok: true });
});
