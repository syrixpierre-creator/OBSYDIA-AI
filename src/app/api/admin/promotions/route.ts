import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, ok, parseJson, withUser } from "@/lib/http";
import { audit } from "@/lib/audit";

export const POST = withUser(
  async (req, { user }) => {
    const b = await parseJson(
      req,
      z.object({
        name: z.string().trim().min(2).max(80),
        discountPercent: z.number().min(1).max(90),
        countryId: z.number().int().positive().nullable().optional(),
        serviceId: z.number().int().positive().nullable().optional(),
        startsAt: z.coerce.date(),
        endsAt: z.coerce.date(),
      }),
    );
    if (b.endsAt <= b.startsAt) throw new HttpError(422, "End date must be after start date", "validation_error");
    const p = await db.promotion.create({ data: { ...b, countryId: b.countryId ?? null, serviceId: b.serviceId ?? null } });
    await audit({ actorId: user.id, action: "admin.promotion_created", entity: "promotion", entityId: String(p.id), metadata: { name: b.name } });
    return ok({ id: p.id }, 201);
  },
  { admin: true },
);
