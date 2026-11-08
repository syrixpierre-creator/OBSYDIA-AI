import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseJson, withUser } from "@/lib/http";
import { audit } from "@/lib/audit";

export const PATCH = withUser<{ params: Promise<{ id: string }> }>(
  async (req, { user, params }) => {
    const id = Number((await params).id);
    const b = await parseJson(
      req,
      z.object({
        enabled: z.boolean().optional(),
        marginPercent: z.number().min(0).max(1000).optional(),
        marginFixedCents: z.number().int().min(0).max(100000).optional(),
        minPriceCents: z.number().int().min(1).max(100000).nullable().optional(),
      }),
    );
    await db.pricingRule.update({ where: { id }, data: b });
    await audit({ actorId: user.id, action: "admin.pricing_rule_updated", entity: "pricing_rule", entityId: String(id), metadata: b });
    return ok({ ok: true });
  },
  { admin: true },
);

export const DELETE = withUser<{ params: Promise<{ id: string }> }>(
  async (_req, { user, params }) => {
    const id = Number((await params).id);
    await db.pricingRule.delete({ where: { id } });
    await audit({ actorId: user.id, action: "admin.pricing_rule_deleted", entity: "pricing_rule", entityId: String(id) });
    return ok({ ok: true });
  },
  { admin: true },
);
