import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureCatalog, getCatalog } from "@/lib/catalog";
import { errorResponse, ipOf, limit } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await limit(`catalog:${ipOf(req)}`, 120, 60);
    await ensureCatalog();
    const url = new URL(req.url);
    const countryId = Number(url.searchParams.get("country")) || undefined;
    const serviceId = Number(url.searchParams.get("service")) || undefined;
    const q = url.searchParams.get("q")?.slice(0, 60) || undefined;
    const inStockOnly = url.searchParams.get("inStock") === "1";
    const maxPriceCents = Number(url.searchParams.get("maxPrice")) || undefined;
    const [entries, countries, services] = await Promise.all([
      getCatalog({ countryId, serviceId, q, inStockOnly, maxPriceCents }),
      db.country.findMany({ where: { enabled: true, offerings: { some: { enabled: true } } }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
      db.service.findMany({ where: { enabled: true, offerings: { some: { enabled: true } } }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
    ]);
    return NextResponse.json({ entries, countries, services }, { headers: { "Cache-Control": "private, max-age=15" } });
  } catch (e) {
    return errorResponse(e);
  }
}
