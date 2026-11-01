import { PromoCode, PromoRedemption } from "../../models/index.js";
import { badRequest } from "../../lib/errors.js";

export async function evaluatePromo(code: string | undefined, plan: string, priceCents: number) {
  if (!code) return null;
  const promo = await PromoCode.findOne({ code: code.trim().toUpperCase() }).lean<any>();
  if (!promo || !promo.active) throw badRequest("promo_invalid", "This promo code is not valid");
  if (promo.expiresAt && promo.expiresAt < new Date()) throw badRequest("promo_expired", "This promo code has expired");
  if (promo.maxUses !== null && promo.maxUses !== undefined && promo.uses >= promo.maxUses) throw badRequest("promo_exhausted", "This promo code has reached its usage limit");
  if (promo.plans?.length && !promo.plans.includes(plan)) throw badRequest("promo_not_applicable", "This promo code does not apply to this plan");
  const discount = promo.type === "percent" ? Math.round((priceCents * Math.min(100, promo.value)) / 100) : Math.round(promo.value * 100);
  const discountCents = Math.min(priceCents, Math.max(0, discount));
  return { promo, discountCents, finalCents: priceCents - discountCents };
}

export async function reservePromo(promoId: unknown, userId: unknown, plan: string, provider: string, checkoutRef: string, discountCents: number) {
  await PromoRedemption.create({ promoCodeId: promoId, userId, plan, provider, checkoutRef, discountCents, status: "reserved" });
}

export async function redeemPromo(checkoutRef: string) {
  const r = await PromoRedemption.findOneAndUpdate({ checkoutRef, status: "reserved" }, { $set: { status: "redeemed" } }, { new: true }).lean<any>();
  if (!r) return false;
  const updated = await PromoCode.updateOne(
    { _id: r.promoCodeId, $or: [{ maxUses: null }, { $expr: { $lt: ["$uses", "$maxUses"] } }] },
    { $inc: { uses: 1 } }
  );
  return updated.modifiedCount === 1;
}
