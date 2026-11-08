import { HttpError, limit, ok, withUser } from "@/lib/http";
import { sendVerificationEmail } from "@/lib/auth-flows";

export const POST = withUser(async (_req, { user }) => {
  await limit(`resend:${user.id}`, 3, 3600);
  if (user.emailVerified) throw new HttpError(409, "Email already verified.", "already_verified");
  const sent = await sendVerificationEmail(user);
  return ok({ ok: true, sent });
});
