import type { Prisma } from "@prisma/client";
import { Globe2 } from "lucide-react";
import { db } from "@/lib/db";
import { loadPricingContext, quote } from "@/lib/pricing";
import { PageHeader } from "@/components/app/app-shell";
import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, pageParams } from "@/components/ui/pagination";
import { SearchForm } from "@/components/admin/search-form";
import { FilterTabs } from "@/components/app/filter-tabs";
import { FormDialog, ToggleField } from "@/components/admin/actions";
import { flagEmoji, formatMoney, formatNumber, timeAgo } from "@/lib/utils";

export const metadata = { title: "Admin · Catalog" };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const view = sp.view === "services" ? "services" : sp.view === "offerings" ? "offerings" : "countries";
  const q = sp.q?.trim();
  const { page, pageSize, skip, take } = pageParams(sp, view === "offerings" ? 30 : 40);

  const nameFilter = q ? { name: { contains: q, mode: "insensitive" as const } } : {};
  const oWhere: Prisma.ProviderServiceWhereInput = q
    ? { OR: [{ country: { name: { contains: q, mode: "insensitive" } } }, { service: { name: { contains: q, mode: "insensitive" } } }] }
    : {};

  const [countries, cTotal, services, sTotal, offerings, oTotal, ctx] = await Promise.all([
    view === "countries" ? db.country.findMany({ where: nameFilter, orderBy: { name: "asc" }, skip, take, include: { _count: { select: { offerings: true, orders: true } } } }) : [],
    view === "countries" ? db.country.count({ where: nameFilter }) : 0,
    view === "services" ? db.service.findMany({ where: nameFilter, orderBy: { name: "asc" }, skip, take, include: { _count: { select: { offerings: true, orders: true } } } }) : [],
    view === "services" ? db.service.count({ where: nameFilter }) : 0,
    view === "offerings" ? db.providerService.findMany({ where: oWhere, orderBy: [{ service: { name: "asc" } }, { country: { name: "asc" } }], skip, take, include: { country: true, service: true, provider: true } }) : [],
    view === "offerings" ? db.providerService.count({ where: oWhere }) : 0,
    loadPricingContext(),
  ]);

  return (
    <>
      <PageHeader title="Countries & Services" description="Created automatically from provider synchronization. Enable, disable or rename them here." />
      <FilterTabs tabs={[{ value: "", label: "Countries" }, { value: "services", label: "Services" }, { value: "offerings", label: "Offerings & prices" }]} param="view" current={view === "countries" ? "" : view} basePath="/admin/catalog" />
      <SearchForm action="/admin/catalog" q={q} placeholder="Search by name…">{view !== "countries" && <input type="hidden" name="view" value={view} />}</SearchForm>
      <Card>
        {view === "countries" &&
          (countries.length === 0 ? (
            <EmptyState icon={Globe2} title="No countries" description="Run a provider sync to import countries." />
          ) : (
            <>
              <Table>
                <THead><tr><TH>Country</TH><TH>Code</TH><TH>Offerings</TH><TH>Orders</TH><TH>Enabled</TH><TH className="text-right">Actions</TH></tr></THead>
                <tbody>
                  {countries.map((c) => (
                    <TR key={c.id}>
                      <TD><span className="mr-2 text-lg">{flagEmoji(c.code)}</span>{c.name}</TD>
                      <TD className="font-mono text-xs">{c.code}</TD>
                      <TD>{c._count.offerings}</TD>
                      <TD>{c._count.orders}</TD>
                      <TD><ToggleField path={`/api/admin/countries/${c.id}`} field="enabled" checked={c.enabled} label={`Enable ${c.name}`} /></TD>
                      <TD className="text-right">
                        <FormDialog trigger={<Button variant="ghost" size="sm">Rename</Button>} title="Rename country" path={`/api/admin/countries/${c.id}`} method="PATCH" fields={[{ name: "name", label: "Name", defaultValue: c.name, required: true }]} />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
              <Pagination page={page} pageSize={pageSize} total={cTotal} basePath="/admin/catalog" params={{ q }} />
            </>
          ))}
        {view === "services" &&
          (services.length === 0 ? (
            <EmptyState icon={Globe2} title="No services" />
          ) : (
            <>
              <Table>
                <THead><tr><TH>Service</TH><TH>Code</TH><TH>Offerings</TH><TH>Orders</TH><TH>Enabled</TH><TH className="text-right">Actions</TH></tr></THead>
                <tbody>
                  {services.map((s) => (
                    <TR key={s.id}>
                      <TD className="font-medium">{s.name}</TD>
                      <TD className="font-mono text-xs">{s.code}</TD>
                      <TD>{s._count.offerings}</TD>
                      <TD>{s._count.orders}</TD>
                      <TD><ToggleField path={`/api/admin/services/${s.id}`} field="enabled" checked={s.enabled} label={`Enable ${s.name}`} /></TD>
                      <TD className="text-right">
                        <FormDialog trigger={<Button variant="ghost" size="sm">Rename</Button>} title="Rename service" path={`/api/admin/services/${s.id}`} method="PATCH" fields={[{ name: "name", label: "Name", defaultValue: s.name, required: true }]} />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
              <Pagination page={page} pageSize={pageSize} total={sTotal} basePath="/admin/catalog" params={{ q, view }} />
            </>
          ))}
        {view === "offerings" &&
          (offerings.length === 0 ? (
            <EmptyState icon={Globe2} title="No offerings" />
          ) : (
            <>
              <Table>
                <THead><tr><TH>Offering</TH><TH>Provider</TH><TH>Cost</TH><TH>Sale price</TH><TH>Margin</TH><TH>Stock</TH><TH>Synced</TH><TH>Enabled</TH><TH className="text-right">Price</TH></tr></THead>
                <tbody>
                  {offerings.map((o) => {
                    const qte = quote(ctx, o);
                    return (
                      <TR key={o.id}>
                        <TD><p className="font-medium">{o.service.name}</p><p className="text-xs text-muted">{flagEmoji(o.country.code)} {o.country.name}</p></TD>
                        <TD>{o.provider.name}</TD>
                        <TD className="tabular-nums text-muted">{formatMoney(o.costCents)}</TD>
                        <TD className="tabular-nums">
                          {formatMoney(qte.priceCents)}
                          {o.priceOverrideCents && <Badge tone="blue" className="ml-1">Fixed</Badge>}
                          {qte.discountPercent > 0 && <Badge tone="green" className="ml-1">−{qte.discountPercent}%</Badge>}
                        </TD>
                        <TD className="tabular-nums text-green-300">{formatMoney(qte.marginCents)}</TD>
                        <TD className={o.available === 0 ? "text-red-300" : ""}>{formatNumber(o.available)}</TD>
                        <TD className="whitespace-nowrap text-xs text-muted">{timeAgo(o.lastSyncedAt)}</TD>
                        <TD><ToggleField path={`/api/admin/offerings/${o.id}`} field="enabled" checked={o.enabled} /></TD>
                        <TD className="text-right">
                          <FormDialog
                            trigger={<Button variant="ghost" size="sm">Set price</Button>}
                            title="Fixed sale price"
                            description={`Provider cost ${formatMoney(o.costCents)}. Leave empty to use pricing rules again.`}
                            path={`/api/admin/offerings/${o.id}`}
                            method="PATCH"
                            fields={[{ name: "priceOverrideCents", label: "Sale price (USD)", type: "number", money: true, defaultValue: o.priceOverrideCents ? (o.priceOverrideCents / 100).toFixed(2) : "" }]}
                            success="Price updated"
                          />
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
              <Pagination page={page} pageSize={pageSize} total={oTotal} basePath="/admin/catalog" params={{ q, view }} />
            </>
          ))}
      </Card>
    </>
  );
}
