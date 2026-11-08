import { FlaskConical, Plus, RefreshCw, Server, Wifi } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
import { ADAPTERS, providerApiKey } from "@/lib/providers/registry";
import { maskSecret } from "@/lib/crypto";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionButton, FormDialog, ToggleField } from "@/components/admin/actions";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils";

export const metadata = { title: "Admin · Providers" };

export default async function ProvidersPage() {
  const admin = await requireAdminPage();
  const providers = await db.provider.findMany({ orderBy: { priority: "asc" }, include: { _count: { select: { offerings: true, orders: true } } } });
  const inStock = await db.providerService.groupBy({ by: ["providerId"], where: { available: { gt: 0 } }, _count: true });
  const superAdmin = admin.role === "SUPER_ADMIN";
  return (
    <>
      <PageHeader
        title="API Providers"
        description="Suppliers are plugged in through adapters. Catalog, prices and stock are synchronized automatically every 10 minutes."
        actions={
          superAdmin && (
            <FormDialog
              trigger={<Button><Plus /> Add provider</Button>}
              title="Add a provider"
              description="Select an adapter implemented in src/lib/providers. Secrets can also be set with PROVIDER_<CODE>_API_KEY."
              path="/api/admin/providers"
              fields={[
                { name: "name", label: "Display name", required: true, placeholder: "My supplier" },
                { name: "code", label: "Code", required: true, placeholder: "mysupplier", hint: "Lowercase identifier, used for the env variable name." },
                { name: "adapter", label: "Adapter", type: "select", options: Object.entries(ADAPTERS).map(([k, v]) => ({ value: k, label: v.label })) },
                { name: "priority", label: "Priority", type: "number", defaultValue: 100, hint: "Lower = preferred when prices are equal." },
                { name: "apiKey", label: "API key (optional)", type: "password", hint: "Stored AES-256-GCM encrypted. Never displayed again." },
              ]}
              success="Provider created"
            />
          )
        }
      />
      {providers.length === 0 ? (
        <Card><EmptyState icon={Server} title="No provider configured" /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {providers.map((p) => {
            const key = providerApiKey(p);
            const keySource = process.env[`PROVIDER_${p.code.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`] ? "env" : p.apiKeyEncrypted ? "encrypted DB" : null;
            const adapter = ADAPTERS[p.adapter];
            return (
              <Card key={p.id} className={p.enabled ? "" : "opacity-70"}>
                <CardContent>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]">
                        {p.isDemo ? <FlaskConical className="h-5 w-5 text-amber-300" /> : <Server className="h-5 w-5 text-violet-300" />}
                      </div>
                      <div>
                        <p className="font-semibold">{p.name}</p>
                        <p className="text-xs text-muted">adapter <code className="font-mono">{p.adapter}</code> · code <code className="font-mono">{p.code}</code> · priority {p.priority}</p>
                      </div>
                    </div>
                    <ToggleField path={`/api/admin/providers/${p.id}`} field="enabled" checked={p.enabled} label="Enable provider" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {p.isDemo && <Badge tone="amber">DEMO — simulated numbers</Badge>}
                    {!adapter && <Badge tone="red">Adapter missing</Badge>}
                    <Badge tone={p.lastSyncStatus?.startsWith("ok") ? "green" : p.lastSyncStatus ? "red" : "neutral"}>{p.lastSyncStatus?.startsWith("ok") ? "Sync OK" : p.lastSyncStatus ? "Sync error" : "Not synced"}</Badge>
                    <Badge tone={key || p.isDemo ? "blue" : "amber"}>{p.isDemo ? "No key needed" : key ? `Key: ${maskSecret(key)} (${keySource})` : "No API key"}</Badge>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    {[
                      ["Balance", p.balanceCents !== null ? formatMoney(p.balanceCents) : "—"],
                      ["Offerings", formatNumber(p._count.offerings)],
                      ["In stock", formatNumber(inStock.find((i) => i.providerId === p.id)?._count ?? 0)],
                      ["Orders", formatNumber(p._count.orders)],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-xl border border-white/[0.06] p-2.5">
                        <dt className="text-[10px] uppercase tracking-wider text-muted">{k}</dt>
                        <dd className="mt-0.5 font-medium tabular-nums">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-xs text-muted">Last sync: {formatDate(p.lastSyncAt)} {p.lastSyncStatus && `— ${p.lastSyncStatus}`}</p>
                  {p.lastError && <p className="mt-2 rounded-lg border border-danger/20 bg-danger/[0.06] p-2 font-mono text-[11px] text-red-200">{p.lastError}</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ActionButton path={`/api/admin/providers/${p.id}/sync`} label="Sync catalog" success="Catalog synchronized" icon={<RefreshCw />} />
                    <ActionButton path={`/api/admin/providers/${p.id}/test`} label="Test connection" success="Connection OK" icon={<Wifi />} />
                    <FormDialog
                      trigger={<Button variant="secondary" size="sm">Edit</Button>}
                      title={`Edit ${p.name}`}
                      path={`/api/admin/providers/${p.id}`}
                      method="PATCH"
                      fields={[
                        { name: "name", label: "Display name", defaultValue: p.name },
                        { name: "priority", label: "Priority", type: "number", defaultValue: p.priority },
                        ...(superAdmin && !p.isDemo ? [{ name: "apiKey", label: "New API key", type: "password" as const, hint: "Leave empty to keep the current key. Env variables take precedence." }] : []),
                      ]}
                      success="Provider updated"
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <Card className="mt-4">
        <CardContent className="text-sm text-muted">
          <p className="font-medium text-foreground">Connecting a real supplier</p>
          <p className="mt-1">
            Implement the <code className="font-mono text-violet-200">ProviderAdapter</code> interface (getBalance, getCountries, getServices, getPrices, getAvailability, requestNumber, getSMS, cancelNumber) in
            <code className="font-mono text-violet-200"> src/lib/providers/</code> from the supplier&apos;s official documentation, register it in <code className="font-mono text-violet-200">registry.ts</code>, then add it here. See <code className="font-mono">docs/PROVIDERS.md</code>.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
