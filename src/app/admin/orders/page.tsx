import type { OrderStatus, Prisma } from "@prisma/client";
import { ShoppingBag } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app/app-shell";
import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, pageParams } from "@/components/ui/pagination";
import { SearchForm } from "@/components/admin/search-form";
import { FilterTabs } from "@/components/app/filter-tabs";
import { ActionButton, FormDialog } from "@/components/admin/actions";
import { flagEmoji, formatDate, formatMoney } from "@/lib/utils";

export const metadata = { title: "Admin · Orders" };
const STATUSES: OrderStatus[] = ["PENDING", "ACTIVE", "RECEIVED", "COMPLETED", "CANCELLED", "EXPIRED", "FAILED"];

export default async function AdminOrders({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 25);
  const q = sp.q?.trim();
  const where: Prisma.OrderWhereInput = {
    ...(STATUSES.includes(sp.status as OrderStatus) ? { status: sp.status as OrderStatus } : {}),
    ...(q ? { OR: [{ id: q }, { phoneNumber: { contains: q } }, { user: { email: { contains: q, mode: "insensitive" } } }, { providerOrderId: q }] } : {}),
  };
  const [orders, total] = await Promise.all([
    db.order.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { user: { select: { email: true } }, country: true, service: true, provider: true, _count: { select: { sms: true } } } }),
    db.order.count({ where }),
  ]);
  const refunded = new Set(
    (await db.walletTransaction.findMany({ where: { idempotencyKey: { in: orders.map((o) => `order:refund:${o.id}`) } }, select: { orderId: true } })).map((r) => r.orderId),
  );
  return (
    <>
      <PageHeader title="Orders" description={`${total} orders`} />
      <SearchForm action="/admin/orders" q={q} placeholder="Order ID, phone number, user email, provider order ID…">
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
      </SearchForm>
      <FilterTabs tabs={[{ value: "", label: "All" }, ...STATUSES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))]} param="status" current={sp.status ?? ""} basePath="/admin/orders" extra={{ q }} />
      <Card>
        {orders.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="No orders" />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Order</TH>
                  <TH>User</TH>
                  <TH>Number</TH>
                  <TH>Status</TH>
                  <TH>Price / cost</TH>
                  <TH>Provider</TH>
                  <TH>Date</TH>
                  <TH className="text-right">Actions</TH>
                </tr>
              </THead>
              <tbody>
                {orders.map((o) => (
                  <TR key={o.id}>
                    <TD>
                      <p className="font-medium">{flagEmoji(o.country.code)} {o.service.name}</p>
                      <p className="font-mono text-[11px] text-muted">{o.id}</p>
                    </TD>
                    <TD className="text-muted">{o.user.email}</TD>
                    <TD className="font-mono text-xs">{o.phoneNumber ?? "—"}<p className="text-[11px] text-muted">{o._count.sms} SMS</p></TD>
                    <TD>
                      <StatusBadge status={o.status} />
                      {refunded.has(o.id) && <Badge tone="violet" className="ml-1">Refunded</Badge>}
                    </TD>
                    <TD className="tabular-nums">{formatMoney(o.priceCents)}<p className="text-[11px] text-muted">cost {formatMoney(o.costCents)}</p></TD>
                    <TD>{o.provider.name}{o.isDemo && <Badge tone="amber" className="ml-1">Demo</Badge>}</TD>
                    <TD className="whitespace-nowrap text-muted">{formatDate(o.createdAt)}</TD>
                    <TD>
                      <div className="flex justify-end gap-1.5">
                        {["ACTIVE", "RECEIVED"].includes(o.status) && <ActionButton path={`/api/admin/orders/${o.id}/refresh`} label="Refresh" success="Order refreshed" />}
                        {!refunded.has(o.id) && o.status !== "PENDING" && (
                          <FormDialog
                            trigger={<Button variant="danger" size="sm">Refund</Button>}
                            title="Refund this order to the wallet?"
                            description={`${formatMoney(o.priceCents)} will be credited to ${o.user.email}. An order can only be refunded once.`}
                            path={`/api/admin/orders/${o.id}/refund`}
                            fields={[{ name: "reason", label: "Reason", required: true, placeholder: "Code not received" }]}
                            submitLabel="Refund"
                            success="Order refunded"
                          />
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/orders" params={{ q, status: sp.status }} />
          </>
        )}
      </Card>
    </>
  );
}
