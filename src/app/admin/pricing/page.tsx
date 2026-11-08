import { Percent, Plus, Tags, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { loadPricingContext, quote } from "@/lib/pricing";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionButton, FormDialog, ToggleField } from "@/components/admin/actions";
import { flagEmoji, formatDate, formatMoney } from "@/lib/utils";

export const metadata = { title: "Admin · Pricing" };

export default async function PricingPage() {
  const [settings, rules, promos, countries, services, ctx] = await Promise.all([
    getSetting("pricing"),
    db.pricingRule.findMany({ orderBy: [{ scope: "asc" }, { id: "asc" }], include: { country: true, service: true } }),
    db.promotion.findMany({ orderBy: { createdAt: "desc" }, include: { country: true, service: true } }),
    db.country.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
    db.service.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    loadPricingContext(),
  ]);
  const countryOpts = [{ value: "", label: "—" }, ...countries.map((c) => ({ value: String(c.id), label: `${flagEmoji(c.code)} ${c.name}` }))];
  const serviceOpts = [{ value: "", label: "—" }, ...services.map((s) => ({ value: String(s.id), label: s.name }))];
  const examples = [10, 25, 50, 100, 150].map((c) => ({ cost: c, price: quote({ ...ctx, rules: [], promos: [] }, { costCents: c, countryId: -1, serviceId: -1 }).priceCents }));
  const now = new Date();

  return (
    <>
      <PageHeader title="Pricing & Promotions" description="Sale price = provider cost + margin. Precedence: fixed price › country+service › service › country › global rule › defaults." />
      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <Card className="glow-ring">
          <CardHeader>
            <div>
              <CardTitle>Default margin</CardTitle>
              <CardDescription>Applied when no rule matches.</CardDescription>
            </div>
            <FormDialog
              trigger={<Button size="sm" variant="secondary">Edit</Button>}
              title="Default pricing"
              path="/api/admin/settings/pricing"
              method="PATCH"
              fields={[
                { name: "defaultMarginPercent", label: "Margin (%)", type: "number", defaultValue: settings.defaultMarginPercent, hint: "100% = provider cost × 2" },
                { name: "defaultMarginFixedCents", label: "Fixed margin (USD)", type: "number", money: true, defaultValue: (settings.defaultMarginFixedCents / 100).toFixed(2) },
                { name: "minPriceCents", label: "Minimum price (USD)", type: "number", money: true, defaultValue: (settings.minPriceCents / 100).toFixed(2) },
                { name: "rounding", label: "Rounding", type: "select", defaultValue: settings.rounding, options: [{ value: "x99", label: "Round up to .99 (1.99, 2.99…)" }, { value: "none", label: "No rounding" }] },
              ]}
              success="Default pricing saved"
            />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-xl border border-white/[0.06] p-3"><p className="text-[10px] uppercase tracking-wider text-muted">Margin</p><p className="mt-1 text-lg font-semibold">{settings.defaultMarginPercent}%</p></div>
              <div className="rounded-xl border border-white/[0.06] p-3"><p className="text-[10px] uppercase tracking-wider text-muted">Fixed</p><p className="mt-1 text-lg font-semibold">{formatMoney(settings.defaultMarginFixedCents)}</p></div>
              <div className="rounded-xl border border-white/[0.06] p-3"><p className="text-[10px] uppercase tracking-wider text-muted">Min price</p><p className="mt-1 text-lg font-semibold">{formatMoney(settings.minPriceCents)}</p></div>
            </div>
            <p className="mt-5 text-xs font-medium uppercase tracking-wider text-muted">Simulation (default rule)</p>
            <ul className="mt-2 divide-y divide-white/[0.05] text-sm">
              {examples.map((e) => (
                <li key={e.cost} className="flex justify-between py-2">
                  <span className="text-muted">Provider cost {formatMoney(e.cost)}</span>
                  <span className="tabular-nums">→ <strong>{formatMoney(e.price)}</strong> <span className="text-green-300">(+{formatMoney(e.price - e.cost)})</span></span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Pricing rules</CardTitle>
              <CardDescription>Margins per country, per service or per pair.</CardDescription>
            </div>
            <FormDialog
              trigger={<Button size="sm"><Plus /> New rule</Button>}
              title="New pricing rule"
              path="/api/admin/pricing-rules"
              fields={[
                { name: "scope", label: "Scope", type: "select", options: [{ value: "GLOBAL", label: "Global" }, { value: "COUNTRY", label: "Country" }, { value: "SERVICE", label: "Service" }, { value: "COUNTRY_SERVICE", label: "Country + Service" }] },
                { name: "countryId", label: "Country", type: "select", options: countryOpts },
                { name: "serviceId", label: "Service", type: "select", options: serviceOpts },
                { name: "marginPercent", label: "Margin (%)", type: "number", defaultValue: 100, required: true },
                { name: "marginFixedCents", label: "Fixed margin (USD)", type: "number", money: true, defaultValue: "0" },
                { name: "minPriceCents", label: "Minimum price (USD, optional)", type: "number", money: true },
              ]}
              intFields={["countryId", "serviceId"]}
              success="Rule created"
            />
          </CardHeader>
          <CardContent className="px-0 sm:px-0">
            {rules.length === 0 ? (
              <EmptyState icon={Percent} title="No rules" description="The default margin applies to every offering." className="py-8" />
            ) : (
              <Table>
                <THead><tr><TH>Scope</TH><TH>Target</TH><TH>Margin</TH><TH>Min</TH><TH>On</TH><TH /></tr></THead>
                <tbody>
                  {rules.map((r) => (
                    <TR key={r.id}>
                      <TD><Badge tone="violet">{r.scope.replace("_", " + ")}</Badge></TD>
                      <TD>{[r.country && `${flagEmoji(r.country.code)} ${r.country.name}`, r.service?.name].filter(Boolean).join(" · ") || "All offerings"}</TD>
                      <TD className="tabular-nums">{r.marginPercent}%{r.marginFixedCents > 0 && ` + ${formatMoney(r.marginFixedCents)}`}</TD>
                      <TD className="tabular-nums">{r.minPriceCents ? formatMoney(r.minPriceCents) : "—"}</TD>
                      <TD><ToggleField path={`/api/admin/pricing-rules/${r.id}`} field="enabled" checked={r.enabled} /></TD>
                      <TD className="text-right">
                        <ActionButton path={`/api/admin/pricing-rules/${r.id}`} method="DELETE" label="" icon={<Trash2 />} variant="ghost" size="icon" success="Rule deleted" confirm={{ title: "Delete this rule?", tone: "danger" }} />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Promotions</CardTitle>
            <CardDescription>Time-limited discounts. The best matching promotion applies; price never goes below provider cost.</CardDescription>
          </div>
          <FormDialog
            trigger={<Button size="sm"><Plus /> New promotion</Button>}
            title="New promotion"
            path="/api/admin/promotions"
            fields={[
              { name: "name", label: "Name", required: true, placeholder: "Black Friday" },
              { name: "discountPercent", label: "Discount (%)", type: "number", required: true, defaultValue: 10 },
              { name: "countryId", label: "Country (optional)", type: "select", options: countryOpts },
              { name: "serviceId", label: "Service (optional)", type: "select", options: serviceOpts },
              { name: "startsAt", label: "Starts", type: "datetime-local", required: true },
              { name: "endsAt", label: "Ends", type: "datetime-local", required: true },
            ]}
            intFields={["countryId", "serviceId"]}
            dateFields={["startsAt", "endsAt"]}
            success="Promotion created"
          />
        </CardHeader>
        <CardContent className="px-0 sm:px-0">
          {promos.length === 0 ? (
            <EmptyState icon={Tags} title="No promotions" className="py-8" />
          ) : (
            <Table>
              <THead><tr><TH>Name</TH><TH>Discount</TH><TH>Target</TH><TH>Period</TH><TH>State</TH><TH>Active</TH><TH /></tr></THead>
              <tbody>
                {promos.map((p) => {
                  const live = p.active && p.startsAt <= now && p.endsAt >= now;
                  return (
                    <TR key={p.id}>
                      <TD className="font-medium">{p.name}</TD>
                      <TD className="tabular-nums">−{p.discountPercent}%</TD>
                      <TD>{[p.country?.name, p.service?.name].filter(Boolean).join(" · ") || "Everything"}</TD>
                      <TD className="whitespace-nowrap text-xs text-muted">{formatDate(p.startsAt)} → {formatDate(p.endsAt)}</TD>
                      <TD><Badge tone={live ? "green" : "neutral"} dot={live}>{live ? "Running" : p.endsAt < now ? "Ended" : p.active ? "Scheduled" : "Paused"}</Badge></TD>
                      <TD><ToggleField path={`/api/admin/promotions/${p.id}`} field="active" checked={p.active} /></TD>
                      <TD className="text-right"><ActionButton path={`/api/admin/promotions/${p.id}`} method="DELETE" label="" icon={<Trash2 />} variant="ghost" size="icon" success="Promotion deleted" confirm={{ title: "Delete this promotion?", tone: "danger" }} /></TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
