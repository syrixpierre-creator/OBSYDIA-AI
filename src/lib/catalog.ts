import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { getAdapter } from "./providers/registry";
import { syslog } from "./audit";
import { loadPricingContext, quote } from "./pricing";

/**
 * Pulls countries, services, prices and stock from a provider and upserts them.
 * Countries/services are created automatically — nothing to create by hand.
 * Admin-controlled flags (enabled, names, overrides) are preserved.
 */
export async function syncProvider(providerId: string) {
  const provider = await db.provider.findUniqueOrThrow({ where: { id: providerId } });
  const adapter = getAdapter(provider);
  const started = Date.now();
  try {
    const [countries, services, prices, balance] = await Promise.all([
      adapter.getCountries(),
      adapter.getServices(),
      adapter.getPrices(),
      adapter.getBalance().catch(() => null),
    ]);

    const countryIdByProviderCode = new Map<string, number>();
    for (const c of countries) {
      const row = await db.country.upsert({
        where: { code: c.iso2.toUpperCase() },
        create: { code: c.iso2.toUpperCase(), name: c.name },
        update: {},
      });
      countryIdByProviderCode.set(c.providerCode, row.id);
    }
    const serviceIdByProviderCode = new Map<string, number>();
    for (const s of services) {
      const row = await db.service.upsert({
        where: { code: s.slug },
        create: { code: s.slug, name: s.name },
        update: {},
      });
      serviceIdByProviderCode.set(s.providerCode, row.id);
    }

    const now = new Date();
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    let count = 0;
    for (const p of prices) {
      const countryId = countryIdByProviderCode.get(p.countryCode);
      const serviceId = serviceIdByProviderCode.get(p.serviceCode);
      if (!countryId || !serviceId) continue;
      count++;
      ops.push(
        db.providerService.upsert({
          where: { providerId_countryId_serviceId: { providerId, countryId, serviceId } },
          create: {
            providerId,
            countryId,
            serviceId,
            providerCountryCode: p.countryCode,
            providerServiceCode: p.serviceCode,
            costCents: p.costCents,
            available: p.available,
            lastSyncedAt: now,
          },
          update: { costCents: p.costCents, available: p.available, lastSyncedAt: now },
        }),
      );
    }
    for (let i = 0; i < ops.length; i += 200) await db.$transaction(ops.slice(i, i + 200));
    // Offerings no longer returned by the provider are marked out of stock
    await db.providerService.updateMany({ where: { providerId, lastSyncedAt: { lt: now } }, data: { available: 0 } });

    await db.provider.update({
      where: { id: providerId },
      data: {
        lastSyncAt: now,
        lastSyncStatus: `ok · ${countries.length} countries · ${services.length} services · ${count} offerings`,
        lastError: null,
        balanceCents: balance?.amountCents ?? provider.balanceCents,
      },
    });
    await syslog("info", `provider:${provider.code}`, `Catalog synced in ${Date.now() - started}ms`, { offerings: count });
    return { countries: countries.length, services: services.length, offerings: count };
  } catch (e) {
    await db.provider.update({ where: { id: providerId }, data: { lastSyncStatus: "error", lastError: String((e as Error).message).slice(0, 500) } });
    await syslog("error", `provider:${provider.code}`, `Catalog sync failed: ${(e as Error).message}`);
    throw e;
  }
}

export async function syncAllProviders() {
  const providers = await db.provider.findMany({ where: { enabled: true } });
  const results: Record<string, unknown> = {};
  for (const p of providers) {
    try {
      results[p.code] = await syncProvider(p.id);
    } catch (e) {
      results[p.code] = { error: (e as Error).message };
    }
  }
  return results;
}

/** Ensure catalog exists on a fresh install (first visit triggers a sync). */
export async function ensureCatalog() {
  const count = await db.providerService.count();
  if (count > 0) return;
  await syncAllProviders();
}

export type CatalogEntry = {
  offeringId: string;
  country: { id: number; code: string; name: string };
  service: { id: number; code: string; name: string };
  priceCents: number;
  basePriceCents: number;
  discountPercent: number;
  available: number;
  isDemo: boolean;
};

/**
 * Best sellable offering per (country, service): enabled provider, enabled
 * country & service, in stock, lowest sale price (then provider priority).
 */
export async function getCatalog(filters: {
  countryId?: number;
  serviceId?: number;
  q?: string;
  inStockOnly?: boolean;
  maxPriceCents?: number;
} = {}): Promise<CatalogEntry[]> {
  const offerings = await db.providerService.findMany({
    where: {
      enabled: true,
      provider: { enabled: true },
      country: { enabled: true },
      service: { enabled: true },
      ...(filters.countryId ? { countryId: filters.countryId } : {}),
      ...(filters.serviceId ? { serviceId: filters.serviceId } : {}),
      ...(filters.inStockOnly ? { available: { gt: 0 } } : {}),
      ...(filters.q
        ? {
            OR: [
              { country: { name: { contains: filters.q, mode: "insensitive" } } },
              { service: { name: { contains: filters.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { country: true, service: true, provider: true },
  });
  const ctx = await loadPricingContext();
  const best = new Map<string, { entry: CatalogEntry; priority: number }>();
  for (const o of offerings) {
    const q = quote(ctx, o);
    const key = `${o.countryId}:${o.serviceId}`;
    const entry: CatalogEntry = {
      offeringId: o.id,
      country: { id: o.country.id, code: o.country.code, name: o.country.name },
      service: { id: o.service.id, code: o.service.code, name: o.service.name },
      priceCents: q.priceCents,
      basePriceCents: q.basePriceCents,
      discountPercent: q.discountPercent,
      available: o.available,
      isDemo: o.provider.isDemo,
    };
    const prev = best.get(key);
    const better =
      !prev ||
      (entry.available > 0 && prev.entry.available === 0) ||
      ((entry.available > 0) === (prev.entry.available > 0) &&
        (entry.priceCents < prev.entry.priceCents ||
          (entry.priceCents === prev.entry.priceCents && o.provider.priority < prev.priority)));
    if (better) best.set(key, { entry, priority: o.provider.priority });
  }
  let list = [...best.values()].map((b) => b.entry);
  if (filters.maxPriceCents) list = list.filter((e) => e.priceCents <= filters.maxPriceCents!);
  return list;
}
