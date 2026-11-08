import { db } from "@/lib/db";
import { HttpError, ipOf, limit, ok, parseJson, withPublic } from "@/lib/http";
import { registerSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/password";
import { createSession } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { sendVerificationEmail } from "@/lib/auth-flows";
import { audit } from "@/lib/audit";

export const POST = withPublic(async (req) => {
  await limit(`register:${ipOf(req)}`, 5, 3600);
  const general = await getSetting("general");
  if (!general.registrationOpen) throw new HttpError(403, "Registrations are currently closed.", "registration_closed");
  const data = await parseJson(req, registerSchema);
  const exists = await db.user.findUnique({ where: { email: data.email } });
  if (exists) throw new HttpError(409, "An account already exists with this email.", "email_taken");
  const role = await db.role.findUniqueOrThrow({ where: { name: "USER" } });
  const user = await db.user.create({
    data: {
      email: data.email,
      name: data.name,
      passwordHash: await hashPassword(data.password),
      roleId: role.id,
      wallet: { create: {} },
    },
  });
  await sendVerificationEmail(user);
  await createSession(user.id);
  await audit({ actorId: user.id, action: "auth.register", entity: "user", entityId: user.id, ip: ipOf(req) });
  return ok({ ok: true }, 201);
});
