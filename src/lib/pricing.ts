import type { PricingRule, Promotion } from "@prisma/client";
import { db } from "./db";
import { getSetting, type PricingSettings } from "./settings";

export type PricingContext = { rules: PricingRule[]; promos: Promotion[]; settings: PricingSettings };

export async function loadPricingContext(): Promise<PricingContext> {
  const now = new Date();
  const [rules, promos, settings] = await Promise.all([
    db.pricingRule.findMany({ where: { enabled: true } }),
    db.promotion.findMany({ where: { active: true, startsAt: { lte: now }, endsAt: { gte: now } } }),
    getSetting("pricing"),
  ]);
  return { rules, promos, settings };
}

export type PriceQuote = {
  costCents: number;
  basePriceCents: number; // before promotion
  priceCents: number; // final
  discountPercent: number;
  marginCents: number;
  promotion: string | null;
};

function roundX99(cents: number) {
  if (cents < 99) return cents;
  return Math.ceil((cents + 1) / 100) * 100 - 1;
}

/**
 * Sale price = provider cost + margin.
 * Rule precedence: offering override > COUNTRY_SERVICE > SERVICE > COUNTRY > GLOBAL > default settings.
 * Promotions apply on top. Price is never below provider cost.
 */
export function quote(
  ctx: PricingContext,
  o: { costCents: number; countryId: number; serviceId: number; priceOverrideCents?: number | null },
): PriceQuote {
  const { rules, promos, settings } = ctx;
  const find = (scope: PricingRule["scope"], c?: number, s?: number) =>
    rules.find(
      (r) => r.scope === scope && (c === undefined || r.countryId === c) && (s === undefined || r.serviceId === s),
    );
  const rule =
    find("COUNTRY_SERVICE", o.countryId, o.serviceId) ??
    find("SERVICE", undefined, o.serviceId) ??
    find("COUNTRY", o.countryId) ??
    find("GLOBAL");

  const pct = rule ? rule.marginPercent : settings.defaultMarginPercent;
  const fixed = rule ? rule.marginFixedCents : settings.defaultMarginFixedCents;
  const minPrice = rule?.minPriceCents ?? settings.minPriceCents;

  let base: number;
  if (o.priceOverrideCents && o.priceOverrideCents > 0) {
    base = o.priceOverrideCents;
  } else {
    base = Math.ceil(o.costCents * (1 + pct / 100) + fixed);
    base = Math.max(base, minPrice);
    if (settings.rounding === "x99") base = roundX99(base);
  }

  const applicable = promos.filter(
    (p) => (p.countryId === null || p.countryId === o.countryId) && (p.serviceId === null || p.serviceId === o.serviceId),
  );
  const best = applicable.sort((a, b) => b.discountPercent - a.discountPercent)[0];
  const discount = best ? Math.min(90, Math.max(0, best.discountPercent)) : 0;
  let price = Math.round(base * (1 - discount / 100));
  // Never sell below cost (+1 cent safety)
  price = Math.max(price, o.costCents + 1);

  return {
    costCents: o.costCents,
    basePriceCents: base,
    priceCents: price,
    discountPercent: price < base ? discount : 0,
    marginCents: price - o.costCents,
    promotion: price < base && best ? best.name : null,
  };
}
