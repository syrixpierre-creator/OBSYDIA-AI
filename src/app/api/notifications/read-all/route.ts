import { db } from "@/lib/db";
import { ok, withUser } from "@/lib/http";

export const POST = withUser(async (_req, { user }) => {
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  return ok({ ok: true });
});
