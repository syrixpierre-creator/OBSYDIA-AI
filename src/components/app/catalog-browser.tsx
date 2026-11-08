"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CreditCard, FlaskConical, PackageX, Search, ShoppingCart, SlidersHorizontal, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { api, ApiError, newIdempotencyKey } from "@/lib/client-api";
import { cn, flagEmoji, formatMoney, formatNumber } from "@/lib/utils";

type Entry = {
  offeringId: string;
  country: { id: number; code: string; name: string };
  service: { id: number; code: string; name: string };
  priceCents: number;
  basePriceCents: number;
  discountPercent: number;
  available: number;
  isDemo: boolean;
};
type Opt = { id: number; code: string; name: string };

const PAGE = 24;

function ServiceIcon({ name }: { name: string }) {
  const hue = [...name].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
      style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 40) % 360} 70% 35%))` }}
    >
      {name[0]?.toUpperCase()}
    </span>
  );
}

export function CatalogBrowser({ mode, balanceCents = 0, cardEnabled = false }: { mode: "public" | "buy"; balanceCents?: number; cardEnabled?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [countries, setCountries] = useState<Opt[]>([]);
  const [services, setServices] = useState<Opt[]>([]);
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [service, setService] = useState("");
  const [inStock, setInStock] = useState(true);
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState<"price" | "stock" | "name">("price");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Entry | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ entries: Entry[]; countries: Opt[]; services: Opt[] }>("/api/catalog")
      .then((r) => {
        if (cancelled) return;
        setEntries(r.entries);
        setCountries(r.countries);
        setServices(r.services);
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Instant client-side filtering
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const max = Number(maxPrice) * 100;
    const list = entries.filter(
      (e) =>
        (!country || String(e.country.id) === country) &&
        (!service || String(e.service.id) === service) &&
        (!inStock || e.available > 0) &&
        (!max || e.priceCents <= max) &&
        (!term || e.country.name.toLowerCase().includes(term) || e.service.name.toLowerCase().includes(term) || e.country.code.toLowerCase() === term),
    );
    list.sort((a, b) =>
      sort === "price" ? a.priceCents - b.priceCents : sort === "stock" ? b.available - a.available : a.service.name.localeCompare(b.service.name) || a.country.name.localeCompare(b.country.name),
    );
    return list;
  }, [entries, q, country, service, inStock, maxPrice, sort]);

  useEffect(() => setPage(1), [q, country, service, inStock, maxPrice, sort]);
  const visible = filtered.slice(0, page * PAGE);
  const isDemo = entries.some((e) => e.isDemo);

  return (
    <div>
      {isDemo && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-warning/25 bg-warning/[0.06] p-4 text-sm text-amber-100">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <p>
            <strong className="font-semibold">DEMO mode.</strong> The catalog comes from the built-in DEMO provider: numbers and SMS are simulated and no real SMS is delivered.
            Connect a real supplier in Admin → API Providers to go live.
          </p>
        </div>
      )}

      <div className="card mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-[1.6fr_1fr_1fr] xl:grid-cols-[1.6fr_1fr_1fr_0.8fr_0.8fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a service or country…" className="pl-10" aria-label="Search" />
          </div>
          <Select value={service} onChange={(e) => setService(e.target.value)} aria-label="Service">
            <option value="">All services</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country">
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {flagEmoji(c.code)} {c.name}
              </option>
            ))}
          </Select>
          <Input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Max price $" inputMode="decimal" aria-label="Maximum price" />
          <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
            <option value="price">Lowest price</option>
            <option value="stock">Most available</option>
            <option value="name">Name</option>
          </Select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} className="h-4 w-4 accent-violet-600" />
            In stock only
          </label>
          <span className="inline-flex items-center gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5" /> {loading ? "Loading…" : `${formatNumber(filtered.length)} offers`}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card p-4">
              <div className="flex gap-3">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <Skeleton className="mt-5 h-9 w-full" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={PackageX}
            title={entries.length ? "No offers match your filters" : "Catalog is empty"}
            description={entries.length ? "Try another country or service, or include out-of-stock offers." : "No provider has synced its catalog yet."}
            action={
              entries.length ? (
                <Button variant="secondary" size="sm" onClick={() => { setQ(""); setCountry(""); setService(""); setMaxPrice(""); setInStock(false); }}>
                  Reset filters
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visible.map((e) => {
              const out = e.available === 0;
              return (
                <div key={e.offeringId} className={cn("card group flex flex-col p-4 transition hover:border-violet-500/30", out && "opacity-60")}>
                  <div className="flex items-start gap-3">
                    <ServiceIcon name={e.service.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{e.service.name}</p>
                      <p className="truncate text-xs text-muted">
                        <span className="mr-1">{flagEmoji(e.country.code)}</span>
                        {e.country.name}
                      </p>
                    </div>
                    {e.discountPercent > 0 && <Badge tone="green">−{e.discountPercent}%</Badge>}
                  </div>
                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <p className="text-xl font-semibold tabular-nums">{formatMoney(e.priceCents)}</p>
                      {e.discountPercent > 0 && <p className="text-xs text-muted line-through">{formatMoney(e.basePriceCents)}</p>}
                    </div>
                    <p className={cn("text-xs", out ? "text-red-300" : "text-muted")}>{out ? "Out of stock" : `${formatNumber(e.available)} available`}</p>
                  </div>
                  {mode === "buy" ? (
                    <Button className="mt-4 w-full" size="sm" disabled={out} onClick={() => setSelected(e)}>
                      <ShoppingCart /> Buy number
                    </Button>
                  ) : (
                    <Button asChild variant="secondary" className="mt-4 w-full" size="sm">
                      <Link href="/register">Get this number</Link>
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          {visible.length < filtered.length && (
            <div className="mt-6 flex justify-center">
              <Button variant="secondary" onClick={() => setPage(page + 1)}>
                Load more ({filtered.length - visible.length} remaining)
              </Button>
            </div>
          )}
        </>
      )}

      {mode === "buy" && (
        <PurchaseDialog
          entry={selected}
          balanceCents={balanceCents}
          cardEnabled={cardEnabled}
          onClose={() => setSelected(null)}
          onPurchased={(id) => {
            setSelected(null);
            router.push(`/dashboard/orders/${id}`);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function PurchaseDialog({
  entry,
  balanceCents,
  cardEnabled,
  onClose,
  onPurchased,
}: {
  entry: Entry | null;
  balanceCents: number;
  cardEnabled: boolean;
  onClose: () => void;
  onPurchased: (orderId: string) => void;
}) {
  const [loading, setLoading] = useState<"wallet" | "card" | null>(null);
  // one idempotency key per opened dialog: double clicks / retries never create two orders
  const key = useRef(newIdempotencyKey());
  useEffect(() => {
    if (entry) key.current = newIdempotencyKey();
  }, [entry]);
  if (!entry) return null;
  const enough = balanceCents >= entry.priceCents;

  const buyWithWallet = async () => {
    setLoading("wallet");
    try {
      const r = await api<{ order: { id: string } }>("/api/orders", "POST", { countryId: entry.country.id, serviceId: entry.service.id, idempotencyKey: key.current });
      toast.success("Number reserved!");
      onPurchased(r.order.id);
    } catch (e) {
      toast.error((e as Error).message);
      if (e instanceof ApiError && e.details && typeof e.details === "object" && "order_id" in e.details) key.current = newIdempotencyKey();
      setLoading(null);
    }
  };
  const payByCard = async () => {
    setLoading("card");
    try {
      const r = await api<{ url: string }>("/api/payments/order-checkout", "POST", { countryId: entry.country.id, serviceId: entry.service.id });
      window.location.href = r.url;
    } catch (e) {
      toast.error((e as Error).message);
      setLoading(null);
    }
  };

  return (
    <Dialog open={Boolean(entry)} onOpenChange={(o) => !o && !loading && onClose()}>
      <DialogContent title="Confirm your purchase" description="The number is displayed only once the supplier confirms the reservation.">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <div className="flex items-center gap-3">
            <ServiceIcon name={entry.service.name} />
            <div className="flex-1">
              <p className="font-medium">{entry.service.name}</p>
              <p className="text-sm text-muted">
                {flagEmoji(entry.country.code)} {entry.country.name}
              </p>
            </div>
            <p className="text-xl font-semibold tabular-nums">{formatMoney(entry.priceCents)}</p>
          </div>
          <div className="mt-4 space-y-1.5 border-t border-white/[0.06] pt-3 text-sm">
            <div className="flex justify-between text-muted">
              <span>Wallet balance</span>
              <span className="tabular-nums">{formatMoney(balanceCents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">After purchase</span>
              <span className={cn("tabular-nums", !enough && "text-red-300")}>{enough ? formatMoney(balanceCents - entry.priceCents) : "Insufficient"}</span>
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          If no SMS is received before expiry, the amount is refunded to your wallet automatically. By purchasing you confirm a lawful, authorized use in accordance with our Acceptable Use Policy.
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button onClick={buyWithWallet} disabled={!enough || loading !== null} loading={loading === "wallet"} className={cn(!cardEnabled && "sm:col-span-2")}>
            <Wallet /> Pay with wallet
          </Button>
          {cardEnabled && (
            <Button variant="secondary" onClick={payByCard} disabled={loading !== null} loading={loading === "card"}>
              <CreditCard /> Pay by card
            </Button>
          )}
        </div>
        {!enough && (
          <p className="mt-3 text-center text-xs text-muted">
            Not enough balance.{" "}
            <Link href="/dashboard/funds" className="text-violet-300 hover:underline">
              Add funds
            </Link>
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
