import { RotateCcw } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app/app-shell";
import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, pageParams } from "@/components/ui/pagination";
import { StatCard } from "@/components/app/stat-card";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata = { title: "Admin · Refunds" };

export default async function RefundsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 25);
  const [refunds, total, wallet, card, auto] = await Promise.all([
    db.refund.findMany({ orderBy: { createdAt: "desc" }, skip, take, include: { user: { select: { email: true } }, processedBy: { select: { email: true } } } }),
    db.refund.count(),
    db.refund.aggregate({ where: { status: "COMPLETED", target: "WALLET" }, _sum: { amountCents: true } }),
    db.refund.aggregate({ where: { status: "COMPLETED", target: "CARD" }, _sum: { amountCents: true } }),
    db.refund.count({ where: { automatic: true } }),
  ]);
  return (
    <>
      <PageHeader title="Refunds" description="Automatic and manual refunds. Order refunds are issued from Orders, card refunds from Transactions." />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Refunded to wallets" value={formatMoney(wallet._sum.amountCents ?? 0)} icon={RotateCcw} />
        <StatCard label="Refunded to cards" value={formatMoney(card._sum.amountCents ?? 0)} icon={RotateCcw} />
        <StatCard label="Automatic refunds" value={String(auto)} icon={RotateCcw} hint="Expired / failed / cancelled orders" />
      </div>
      <Card>
        {refunds.length === 0 ? (
          <EmptyState icon={RotateCcw} title="No refunds yet" />
        ) : (
          <>
            <Table>
              <THead>
                <tr><TH>Date</TH><TH>User</TH><TH>Target</TH><TH>Reason</TH><TH>Processed by</TH><TH>Status</TH><TH className="text-right">Amount</TH></tr>
              </THead>
              <tbody>
                {refunds.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap text-muted">{formatDate(r.createdAt)}</TD>
                    <TD>{r.user.email}</TD>
                    <TD><Badge tone={r.target === "CARD" ? "blue" : "violet"}>{r.target}</Badge></TD>
                    <TD className="max-w-[260px] truncate">{r.reason.replace(/_/g, " ")}</TD>
                    <TD className="text-muted">{r.automatic ? "System (automatic)" : (r.processedBy?.email ?? "—")}</TD>
                    <TD><StatusBadge status={r.status} /></TD>
                    <TD className="text-right tabular-nums">{formatMoney(r.amountCents)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/refunds" />
          </>
        )}
      </Card>
    </>
  );
}
