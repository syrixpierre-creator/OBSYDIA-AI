import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseJson, withUser } from "@/lib/http";
import { audit } from "@/lib/audit";

export const PATCH = withUser<{ params: Promise<{ id: string }> }>(
  async (req, { user, params }) => {
    const id = Number((await params).id);
    const b = await parseJson(req, z.object({ active: z.boolean() }));
    await db.promotion.update({ where: { id }, data: b });
    await audit({ actorId: user.id, action: "admin.promotion_updated", entity: "promotion", entityId: String(id), metadata: b });
    return ok({ ok: true });
  },
  { admin: true },
);

export const DELETE = withUser<{ params: Promise<{ id: string }> }>(
  async (_req, { user, params }) => {
    const id = Number((await params).id);
    await db.promotion.delete({ where: { id } });
    await audit({ actorId: user.id, action: "admin.promotion_deleted", entity: "promotion", entityId: String(id) });
    return ok({ ok: true });
  },
  { admin: true },
);
