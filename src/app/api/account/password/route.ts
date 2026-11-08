import { z } from "zod";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { HttpError, limit, ok, parseJson, withUser } from "@/lib/http";
import { passwordSchema } from "@/lib/validators";
import { hashPassword, verifyPassword } from "@/lib/password";
import { SESSION_COOKIE } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import { audit } from "@/lib/audit";

export const POST = withUser(async (req, { user }) => {
  await limit(`pwchange:${user.id}`, 5, 900);
  const b = await parseJson(req, z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }));
  const u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(b.currentPassword, u.passwordHash))) throw new HttpError(400, "Current password is incorrect.", "invalid_password");
  const current = (await cookies()).get(SESSION_COOKIE)?.value;
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(b.newPassword) } }),
    db.session.deleteMany({ where: { userId: user.id, NOT: { tokenHash: sha256(current ?? "") } } }),
  ]);
  await audit({ actorId: user.id, action: "auth.password_changed", entity: "user", entityId: user.id });
  return ok({ ok: true });
});
