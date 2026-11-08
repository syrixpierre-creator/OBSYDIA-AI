import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseJson, withUser } from "@/lib/http";
import { audit } from "@/lib/audit";

export const PATCH = withUser<{ params: Promise<{ id: string }> }>(
  async (req, { user, params }) => {
    const { id } = await params;
    const b = await parseJson(
      req,
      z.object({ enabled: z.boolean().optional(), priceOverrideCents: z.number().int().min(1).max(100000).nullable().optional() }),
    );
    await db.providerService.update({ where: { id }, data: b });
    await audit({ actorId: user.id, action: "admin.offering_updated", entity: "provider_service", entityId: id, metadata: b });
    return ok({ ok: true });
  },
  { admin: true },
);
