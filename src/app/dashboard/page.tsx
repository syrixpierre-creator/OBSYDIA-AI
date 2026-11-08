import Link from "next/link";
import { ArrowRight, ArrowDownLeft, ArrowUpRight, ShoppingBag, ShoppingCart, TrendingUp, Wallet, Zap } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ensureWallet } from "@/lib/wallet";
import { PageHeader } from "@/components/app/app-shell";
import { StatCard } from "@/components/app/stat-card";
import { BarChart, lastNDays } from "@/components/app/bar-chart";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { flagEmoji, formatMoney, timeAgo } from "@/lib/utils";

export const metadata = { title: "Overview" };

export default async function Overview() {
  const user = await requireUser();
  const wallet = await ensureWallet(user.id);
  const since = new Date(Date.now() - 14 * 86400_000);
  const [spent, orderCount, activeCount, successCount, txs, orders, recentDebits] = await Promise.all([
    db.walletTransaction.aggregate({ where: { walletId: wallet.id, type: "DEBIT" }, _sum: { amountCents: true } }),
    db.order.count({ where: { userId: user.id } }),
    db.order.count({ where: { userId: user.id, status: { in: ["ACTIVE", "RECEIVED", "PENDING"] } } }),
    db.order.count({ where: { userId: user.id, status: { in: ["RECEIVED", "COMPLETED"] } } }),
    db.walletTransaction.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: "desc" }, take: 6 }),
    db.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 6, include: { country: true, service: true } }),
    db.walletTransaction.findMany({ where: { walletId: wallet.id, type: "DEBIT", createdAt: { gte: since } }, select: { amountCents: true, createdAt: true } }),
  ]);
  const refunds = await db.walletTransaction.aggregate({ where: { walletId: wallet.id, type: "REFUND" }, _sum: { amountCents: true } });
  const totalSpent = -(spent._sum.amountCents ?? 0) - (refunds._sum.amountCents ?? 0);
  const days = lastNDays(14);
  const chart = days.map((d) => ({
    label: d.slice(5),
    value: recentDebits.filter((t) => t.createdAt.toISOString().slice(0, 10) === d).reduce((s, t) => s - t.amountCents, 0),
  }));
  const finished = await db.order.count({ where: { userId: user.id, status: { in: ["RECEIVED", "COMPLETED", "EXPIRED", "CANCELLED"] } } });
  const successRate = finished ? Math.round((successCount / finished) * 100) : null;

  return (
    <>
      <PageHeader
        title={`Hello, ${user.name.split(" ")[0]}`}
        description="Here's what's happening with your account."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/dashboard/funds">Add funds</Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/buy">
                <ShoppingCart /> Buy a number
              </Link>
            </Button>
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard accent label="Available balance" value={formatMoney(wallet.balanceCents)} icon={Wallet} hint="Ready to spend" />
        <StatCard label="Total purchases" value={formatMoney(Math.max(0, totalSpent))} icon={TrendingUp} hint="Net of refunds" />
        <StatCard label="Orders" value={String(orderCount)} icon={ShoppingBag} hint={`${activeCount} active now`} />
        <StatCard label="Success rate" value={successRate === null ? "—" : `${successRate}%`} icon={Zap} hint="Orders with SMS received" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Spending — last 14 days</CardTitle>
              <CardDescription>Number purchases debited from your wallet</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <BarChart data={chart} />
            <div className="mt-2 flex justify-between text-[10px] text-muted">
              <span>{chart[0]?.label}</span>
              <span>{chart[chart.length - 1]?.label}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Latest transactions</CardTitle>
              <CardDescription>Wallet movements</CardDescription>
            </div>
            <Link href="/dashboard/transactions" className="text-xs text-violet-300 hover:underline">View all</Link>
          </CardHeader>
          <CardContent className="pt-4">
            {txs.length === 0 ? (
              <EmptyState icon={Wallet} title="No transactions yet" description="Add funds to start buying numbers." className="py-8" />
            ) : (
              <ul className="space-y-1">
                {txs.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-white/[0.02]">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${t.amountCents > 0 ? "bg-success/10 text-green-300" : "bg-white/[0.04] text-muted"}`}>
                      {t.amountCents > 0 ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{t.description}</p>
                      <p className="text-[11px] text-muted">{timeAgo(t.createdAt)}</p>
                    </div>
                    <span className={`text-sm font-medium tabular-nums ${t.amountCents > 0 ? "text-green-300" : ""}`}>
                      {t.amountCents > 0 ? "+" : "−"}
                      {formatMoney(Math.abs(t.amountCents))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Your latest number orders</CardDescription>
          </div>
          <Link href="/dashboard/orders" className="text-xs text-violet-300 hover:underline">All orders</Link>
        </CardHeader>
        <CardContent className="pt-4">
          {orders.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="No orders yet"
              description="Pick a service and a country to get your first virtual number."
              action={
                <Button asChild size="sm">
                  <Link href="/dashboard/buy">Browse services <ArrowRight /></Link>
                </Button>
              }
            />
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {orders.map((o) => (
                <Link key={o.id} href={`/dashboard/orders/${o.id}`} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3 transition hover:border-violet-500/30">
                  <span className="text-2xl">{flagEmoji(o.country.code)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{o.service.name}</p>
                    <p className="truncate font-mono text-xs text-muted">{o.phoneNumber ?? "Reserving…"}</p>
                  </div>
                  <StatusBadge status={o.status} />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
