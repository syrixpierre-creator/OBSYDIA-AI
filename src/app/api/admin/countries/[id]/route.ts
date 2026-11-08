import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseJson, withUser } from "@/lib/http";
import { audit } from "@/lib/audit";

export const PATCH = withUser<{ params: Promise<{ id: string }> }>(
  async (req, { user, params }) => {
    const id = Number((await params).id);
    const b = await parseJson(req, z.object({ enabled: z.boolean().optional(), name: z.string().trim().min(2).max(80).optional() }));
    await db.country.update({ where: { id }, data: b });
    await audit({ actorId: user.id, action: "admin.country_updated", entity: "country", entityId: String(id), metadata: b });
    return ok({ ok: true });
  },
  { admin: true },
);
