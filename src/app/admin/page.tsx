import Link from "next/link";
import { Activity, CircleDollarSign, LifeBuoy, ShoppingBag, TrendingUp, Users } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app/app-shell";
import { StatCard } from "@/components/app/stat-card";
import { BarChart, lastNDays } from "@/components/app/bar-chart";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { flagEmoji, formatDate, formatMoney, formatNumber, timeAgo } from "@/lib/utils";

export const metadata = { title: "Admin · Statistics" };

export default async function AdminHome() {
  const since = new Date(Date.now() - 14 * 86400_000);
  const day = new Date(Date.now() - 86400_000);
  const sold = { status: { in: ["ACTIVE", "RECEIVED", "COMPLETED"] as ("ACTIVE" | "RECEIVED" | "COMPLETED")[] } };
  const [users, users24, revenue, orders, ordersSold, active, openTickets, providers, recentOrders, recentUsers, payments14, orders14, statusGroups, refundsSum] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: day } } }),
    db.payment.aggregate({ where: { status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] } }, _sum: { amountCents: true, refundedCents: true } }),
    db.order.count(),
    db.order.aggregate({ where: sold, _sum: { priceCents: true, costCents: true } }),
    db.order.count({ where: { status: { in: ["PENDING", "ACTIVE", "RECEIVED"] } } }),
    db.supportTicket.count({ where: { status: { in: ["OPEN", "PENDING"] } } }),
    db.provider.findMany({ orderBy: { priority: "asc" } }),
    db.order.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { email: true } }, country: true, service: true } }),
    db.user.findMany({ orderBy: { createdAt: "desc" }, take: 6, include: { role: true } }),
    db.payment.findMany({ where: { status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] }, completedAt: { gte: since } }, select: { amountCents: true, completedAt: true } }),
    db.order.findMany({ where: { ...sold, createdAt: { gte: since } }, select: { priceCents: true, costCents: true, createdAt: true } }),
    db.order.groupBy({ by: ["status"], _count: true }),
    db.refund.aggregate({ where: { status: "COMPLETED" }, _sum: { amountCents: true } }),
  ]);
  const days = lastNDays(14);
  const revenueChart = days.map((d) => ({ label: d.slice(5), value: payments14.filter((p) => p.completedAt?.toISOString().slice(0, 10) === d).reduce((s, p) => s + p.amountCents, 0) }));
  const salesChart = days.map((d) => ({ label: d.slice(5), value: orders14.filter((o) => o.createdAt.toISOString().slice(0, 10) === d).reduce((s, o) => s + o.priceCents, 0) }));
  const gross = ordersSold._sum.priceCents ?? 0;
  const profit = gross - (ordersSold._sum.costCents ?? 0);

  return (
    <>
      <PageHeader title="Platform statistics" description="Real-time overview of INCONNU SMS." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard accent label="Card revenue" value={formatMoney((revenue._sum.amountCents ?? 0) - (revenue._sum.refundedCents ?? 0))} icon={CircleDollarSign} hint="Net of card refunds" />
        <StatCard label="Number sales" value={formatMoney(gross)} icon={TrendingUp} hint={`Gross margin ${formatMoney(profit)}`} />
        <StatCard label="Users" value={formatNumber(users)} icon={Users} hint={`+${users24} in the last 24h`} />
        <StatCard label="Orders" value={formatNumber(orders)} icon={ShoppingBag} hint={`${active} active · refunds ${formatMoney(refundsSum._sum.amountCents ?? 0)}`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><div><CardTitle>Card payments — 14 days</CardTitle><CardDescription>Confirmed Stripe payments</CardDescription></div></CardHeader>
          <CardContent><BarChart data={revenueChart} /></CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Number sales — 14 days</CardTitle><CardDescription>Delivered orders (sale price)</CardDescription></div></CardHeader>
          <CardContent><BarChart data={salesChart} /></CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Latest orders</CardTitle>
            <Link href="/admin/orders" className="text-xs text-violet-300 hover:underline">All orders</Link>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <p className="text-sm text-muted">No orders yet.</p>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {recentOrders.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="text-xl">{flagEmoji(o.country.code)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{o.service.name} <span className="text-muted">· {o.user.email}</span></p>
                      <p className="text-xs text-muted">{formatDate(o.createdAt)}</p>
                    </div>
                    <span className="tabular-nums">{formatMoney(o.priceCents)}</span>
                    <StatusBadge status={o.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Providers</CardTitle><Link href="/admin/providers" className="text-xs text-violet-300 hover:underline">Manage</Link></CardHeader>
            <CardContent className="space-y-2">
              {providers.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-xl border border-white/[0.06] p-3 text-sm">
                  <div>
                    <p className="font-medium">{p.name} {p.isDemo && <Badge tone="amber" className="ml-1">Demo</Badge>}</p>
                    <p className="text-xs text-muted">{p.lastSyncAt ? `synced ${timeAgo(p.lastSyncAt)}` : "never synced"}</p>
                  </div>
                  <Badge tone={p.enabled ? "green" : "neutral"}>{p.enabled ? "Enabled" : "Disabled"}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Order status</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {statusGroups.length === 0 ? <p className="text-sm text-muted">No data.</p> : statusGroups.map((g) => (
                <span key={g.status} className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] px-2.5 py-1.5 text-sm">
                  <StatusBadge status={g.status} /> <span className="tabular-nums">{g._count}</span>
                </span>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Support</CardTitle><Link href="/admin/support" className="text-xs text-violet-300 hover:underline">Open</Link></CardHeader>
            <CardContent className="flex items-center gap-3">
              <LifeBuoy className="h-5 w-5 text-violet-300" /><p className="text-sm"><span className="text-xl font-semibold">{openTickets}</span> open tickets</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>New users</CardTitle><Link href="/admin/users" className="text-xs text-violet-300 hover:underline">All users</Link></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {recentUsers.map((u) => (
            <div key={u.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] p-3">
              <Activity className="h-4 w-4 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{u.name}</p>
                <p className="truncate text-xs text-muted">{u.email}</p>
              </div>
              <Badge tone={u.role.name === "USER" ? "neutral" : "violet"}>{u.role.name.replace("_", " ")}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
