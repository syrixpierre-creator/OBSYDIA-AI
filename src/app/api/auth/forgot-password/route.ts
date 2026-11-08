import { z } from "zod";
import { db } from "@/lib/db";
import { ipOf, limit, ok, parseJson, withPublic } from "@/lib/http";
import { emailSchema } from "@/lib/validators";
import { sendPasswordResetEmail } from "@/lib/auth-flows";

export const POST = withPublic(async (req) => {
  await limit(`forgot:${ipOf(req)}`, 5, 3600);
  const { email } = await parseJson(req, z.object({ email: emailSchema }));
  const user = await db.user.findUnique({ where: { email } });
  if (user && user.status === "ACTIVE") await sendPasswordResetEmail(user);
  // Same response whether or not the account exists (no user enumeration)
  return ok({ ok: true });
});
