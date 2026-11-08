import { db } from "@/lib/db";
import { HttpError, ok, withUser } from "@/lib/http";
import { audit } from "@/lib/audit";

export const DELETE = withUser<{ params: Promise<{ id: string }> }>(async (_req, { user, params }) => {
  const { id } = await params;
  const res = await db.apiKey.updateMany({ where: { id, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!res.count) throw new HttpError(404, "API key not found", "not_found");
  await audit({ actorId: user.id, action: "api_key.revoked", entity: "api_key", entityId: id });
  return ok({ ok: true });
});
