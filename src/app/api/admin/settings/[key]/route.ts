import { z } from "zod";
import { HttpError, ok, parseJson, withUser } from "@/lib/http";
import { setSetting } from "@/lib/settings";
import { encrypt } from "@/lib/crypto";
import { audit } from "@/lib/audit";

const schemas = {
  general: z.object({
    siteName: z.string().trim().min(2).max(60).optional(),
    supportEmail: z.string().email().optional(),
    maintenanceMode: z.boolean().optional(),
    registrationOpen: z.boolean().optional(),
    requireVerifiedEmailToPurchase: z.boolean().optional(),
    announcement: z.string().max(280).optional(),
  }),
  pricing: z.object({
    defaultMarginPercent: z.number().min(0).max(1000).optional(),
    defaultMarginFixedCents: z.number().int().min(0).max(100000).optional(),
    minPriceCents: z.number().int().min(1).max(100000).optional(),
    rounding: z.enum(["none", "x99"]).optional(),
  }),
  orders: z.object({
    defaultExpiryMinutes: z.number().int().min(5).max(1440).optional(),
    maxActiveOrdersPerUser: z.number().int().min(1).max(1000).optional(),
    maxOrdersPerHour: z.number().int().min(1).max(10000).optional(),
    autoRefundOnExpiry: z.boolean().optional(),
  }),
  payments: z.object({
    enabled: z.boolean().optional(),
    currency: z.enum(["usd", "eur", "gbp"]).optional(),
    minTopupCents: z.number().int().min(50).max(100000).optional(),
    maxTopupCents: z.number().int().min(100).max(1000000).optional(),
    presetAmountsCents: z.array(z.number().int().min(50).max(1000000)).max(8).optional(),
    allowDirectCardPurchase: z.boolean().optional(),
    publishableKey: z.string().max(200).optional(),
    secretKey: z.string().max(300).optional(),
    webhookSecret: z.string().max(300).optional(),
  }),
} as const;

export const PATCH = withUser<{ params: Promise<{ key: string }> }>(
  async (req, { user, params }) => {
    const { key } = await params;
    if (!(key in schemas)) throw new HttpError(404, "Unknown settings group", "not_found");
    const k = key as keyof typeof schemas;
    const body = await parseJson(req, schemas[k] as unknown as z.ZodType<Record<string, unknown>>);
    if (k === "payments") {
      const { secretKey, webhookSecret, ...rest } = body as { secretKey?: string; webhookSecret?: string };
      if ((secretKey || webhookSecret) && user.role !== "SUPER_ADMIN") throw new HttpError(403, "Only a super admin can change Stripe secrets.", "forbidden");
      if (secretKey && !/^sk_(test|live)_/.test(secretKey) && !/^rk_(test|live)_/.test(secretKey)) throw new HttpError(422, "Invalid Stripe secret key format", "validation_error");
      if (webhookSecret && !webhookSecret.startsWith("whsec_")) throw new HttpError(422, "Invalid webhook secret format", "validation_error");
      // currency change is a "pricing" decision; keep it explicit and audited
      await setSetting("payments", {
        ...rest,
        ...(secretKey ? { secretKeyEncrypted: encrypt(secretKey) } : {}),
        ...(webhookSecret ? { webhookSecretEncrypted: encrypt(webhookSecret) } : {}),
      });
      await audit({ actorId: user.id, action: "admin.settings_updated", entity: "settings", entityId: k, metadata: { ...rest, secretKeyChanged: Boolean(secretKey), webhookSecretChanged: Boolean(webhookSecret) } as never });
    } else {
      await setSetting(k, body as never);
      await audit({ actorId: user.id, action: "admin.settings_updated", entity: "settings", entityId: k, metadata: body as never });
    }
    return ok({ ok: true });
  },
  { admin: true },
);
