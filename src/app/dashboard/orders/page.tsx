import Link from "next/link";
import type { OrderStatus, Prisma } from "@prisma/client";
import { ShoppingBag } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/app/app-shell";
import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, pageParams } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { flagEmoji, formatDate, formatMoney } from "@/lib/utils";
import { FilterTabs } from "@/components/app/filter-tabs";

export const metadata = { title: "My Orders" };

const tabs = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "done", label: "Completed" },
  { value: "refunded", label: "Cancelled / Expired" },
];
const map: Record<string, OrderStatus[]> = {
  active: ["PENDING", "ACTIVE", "RECEIVED"],
  done: ["COMPLETED"],
  refunded: ["CANCELLED", "EXPIRED", "FAILED"],
};

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp);
  const where: Prisma.OrderWhereInput = { userId: user.id, ...(sp.status && map[sp.status] ? { status: { in: map[sp.status] } } : {}) };
  const [orders, total] = await Promise.all([
    db.order.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { country: true, service: true, _count: { select: { sms: true } } } }),
    db.order.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="My Orders" description="All your virtual number orders and received messages." actions={<Button asChild><Link href="/dashboard/buy">New order</Link></Button>} />
      <FilterTabs tabs={tabs} param="status" current={sp.status ?? ""} basePath="/dashboard/orders" />
      <Card>
        {orders.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="No orders found" description="Your orders will appear here." action={<Button asChild size="sm"><Link href="/dashboard/buy">Buy a number</Link></Button>} />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Service</TH>
                  <TH>Number</TH>
                  <TH>Status</TH>
                  <TH>SMS</TH>
                  <TH>Price</TH>
                  <TH>Date</TH>
                  <TH />
                </tr>
              </THead>
              <tbody>
                {orders.map((o) => (
                  <TR key={o.id}>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">{flagEmoji(o.country.code)}</span>
                        <div>
                          <p className="font-medium">{o.service.name}</p>
                          <p className="text-xs text-muted">{o.country.name}</p>
                        </div>
                      </div>
                    </TD>
                    <TD className="font-mono text-[13px]">{o.phoneNumber ?? "—"}</TD>
                    <TD>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={o.status} />
                        {o.isDemo && <Badge tone="amber">Demo</Badge>}
                      </div>
                    </TD>
                    <TD>{o._count.sms}</TD>
                    <TD className="tabular-nums">{formatMoney(o.priceCents)}</TD>
                    <TD className="whitespace-nowrap text-muted">{formatDate(o.createdAt)}</TD>
                    <TD className="text-right">
                      <Link href={`/dashboard/orders/${o.id}`} className="text-xs text-violet-300 hover:underline">
                        Details
                      </Link>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={pageSize} total={total} basePath="/dashboard/orders" params={{ status: sp.status }} />
          </>
        )}
      </Card>
    </>
  );
}
