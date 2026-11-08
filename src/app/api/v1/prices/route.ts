import { db } from "@/lib/db";
import { ok } from "@/lib/http";
import { withApiKey } from "@/lib/api-auth";
import { getCatalog } from "@/lib/catalog";

export const GET = withApiKey(async (req) => {
  const url = new URL(req.url);
  const cc = url.searchParams.get("country")?.toUpperCase();
  const sc = url.searchParams.get("service")?.toLowerCase();
  const [country, service] = await Promise.all([
    cc ? db.country.findUnique({ where: { code: cc } }) : null,
    sc ? db.service.findUnique({ where: { code: sc } }) : null,
  ]);
  if ((cc && !country) || (sc && !service)) return ok({ data: [] });
  const entries = await getCatalog({ countryId: country?.id, serviceId: service?.id });
  return ok({
    data: entries.map((e) => ({
      country: e.country.code,
      service: e.service.code,
      price: e.priceCents / 100,
      price_cents: e.priceCents,
      currency: "USD",
      available: e.available,
      discount_percent: e.discountPercent,
      demo: e.isDemo,
    })),
  });
});
