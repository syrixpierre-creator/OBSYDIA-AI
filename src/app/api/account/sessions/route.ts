import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { ok, withUser } from "@/lib/http";
import { SESSION_COOKIE } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";

/** Revoke all other sessions. */
export const DELETE = withUser(async (_req, { user }) => {
  const current = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  const res = await db.session.deleteMany({ where: { userId: user.id, NOT: { tokenHash: sha256(current) } } });
  return ok({ revoked: res.count });
});
