import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, ok, parseJson, withUser } from "@/lib/http";
import { audit } from "@/lib/audit";

const ruleSchema = z.object({
  scope: z.enum(["GLOBAL", "COUNTRY", "SERVICE", "COUNTRY_SERVICE"]),
  countryId: z.number().int().positive().nullable().optional(),
  serviceId: z.number().int().positive().nullable().optional(),
  marginPercent: z.number().min(0).max(1000),
  marginFixedCents: z.number().int().min(0).max(100000),
  minPriceCents: z.number().int().min(1).max(100000).nullable().optional(),
  enabled: z.boolean().default(true),
});

export const POST = withUser(
  async (req, { user }) => {
    const b = await parseJson(req, ruleSchema);
    if ((b.scope === "COUNTRY" || b.scope === "COUNTRY_SERVICE") && !b.countryId) throw new HttpError(422, "Country is required for this scope", "validation_error");
    if ((b.scope === "SERVICE" || b.scope === "COUNTRY_SERVICE") && !b.serviceId) throw new HttpError(422, "Service is required for this scope", "validation_error");
    const rule = await db.pricingRule.create({
      data: {
        ...b,
        countryId: b.scope === "COUNTRY" || b.scope === "COUNTRY_SERVICE" ? b.countryId : null,
        serviceId: b.scope === "SERVICE" || b.scope === "COUNTRY_SERVICE" ? b.serviceId : null,
      },
    });
    await audit({ actorId: user.id, action: "admin.pricing_rule_created", entity: "pricing_rule", entityId: String(rule.id), metadata: b });
    return ok({ id: rule.id }, 201);
  },
  { admin: true },
);
