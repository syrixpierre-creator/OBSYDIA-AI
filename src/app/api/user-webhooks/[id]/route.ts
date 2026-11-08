import { db } from "@/lib/db";
import { HttpError, ok, withUser } from "@/lib/http";

export const DELETE = withUser<{ params: Promise<{ id: string }> }>(async (_req, { user, params }) => {
  const { id } = await params;
  const res = await db.webhook.deleteMany({ where: { id, userId: user.id } });
  if (!res.count) throw new HttpError(404, "Webhook not found", "not_found");
  return ok({ ok: true });
});
