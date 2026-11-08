import type { PaymentStatus, Prisma } from "@prisma/client";
import { CreditCard } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app/app-shell";
import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, pageParams } from "@/components/ui/pagination";
import { SearchForm } from "@/components/admin/search-form";
import { FilterTabs } from "@/components/app/filter-tabs";
import { FormDialog } from "@/components/admin/actions";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata = { title: "Admin · Transactions" };

export default async function AdminTransactions({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const view = sp.view === "ledger" ? "ledger" : "payments";
  const { page, pageSize, skip, take } = pageParams(sp, 25);
  const q = sp.q?.trim();
  const statuses: PaymentStatus[] = ["PENDING", "SUCCEEDED", "FAILED", "EXPIRED", "REFUNDED", "PARTIALLY_REFUNDED"];

  const pWhere: Prisma.PaymentWhereInput = {
    ...(statuses.includes(sp.status as PaymentStatus) ? { status: sp.status as PaymentStatus } : {}),
    ...(q ? { OR: [{ id: q }, { stripeSessionId: q }, { stripePaymentIntentId: q }, { user: { email: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const lWhere: Prisma.WalletTransactionWhereInput = q ? { OR: [{ wallet: { user: { email: { contains: q, mode: "insensitive" } } } }, { orderId: q }, { paymentId: q }] } : {};

  const [payments, pTotal, ledger, lTotal] = await Promise.all([
    view === "payments" ? db.payment.findMany({ where: pWhere, orderBy: { createdAt: "desc" }, skip, take, include: { user: { select: { email: true } } } }) : [],
    view === "payments" ? db.payment.count({ where: pWhere }) : 0,
    view === "ledger" ? db.walletTransaction.findMany({ where: lWhere, orderBy: { createdAt: "desc" }, skip, take, include: { wallet: { include: { user: { select: { email: true } } } } } }) : [],
    view === "ledger" ? db.walletTransaction.count({ where: lWhere }) : 0,
  ]);

  return (
    <>
      <PageHeader title="Transactions" description="Stripe payments and the complete wallet ledger (accounting journal)." />
      <FilterTabs tabs={[{ value: "", label: "Card payments" }, { value: "ledger", label: "Wallet ledger" }]} param="view" current={view === "ledger" ? "ledger" : ""} basePath="/admin/transactions" />
      <SearchForm action="/admin/transactions" q={q} placeholder={view === "payments" ? "Payment ID, Stripe session / intent, user email…" : "User email, order ID, payment ID…"}>
        {view === "ledger" && <input type="hidden" name="view" value="ledger" />}
        {view === "payments" && (
          <select name="status" defaultValue={sp.status ?? ""} className="h-10 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm">
            <option value="">All statuses</option>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </SearchForm>
      <Card>
        {view === "payments" ? (
          payments.length === 0 ? (
            <EmptyState icon={CreditCard} title="No payments" />
          ) : (
            <>
              <Table>
                <THead>
                  <tr><TH>Date</TH><TH>User</TH><TH>Purpose</TH><TH>Stripe</TH><TH>Status</TH><TH className="text-right">Amount</TH><TH className="text-right">Actions</TH></tr>
                </THead>
                <tbody>
                  {payments.map((p) => {
                    const refundable = p.amountCents - p.refundedCents;
                    return (
                      <TR key={p.id}>
                        <TD className="whitespace-nowrap text-muted">{formatDate(p.createdAt)}</TD>
                        <TD>{p.user.email}</TD>
                        <TD>{p.purpose === "TOPUP" ? "Top-up" : "Number"}</TD>
                        <TD className="max-w-[180px] truncate font-mono text-[11px] text-muted">{p.stripePaymentIntentId ?? p.stripeSessionId ?? "—"}</TD>
                        <TD><StatusBadge status={p.status} /></TD>
                        <TD className="text-right tabular-nums">{formatMoney(p.amountCents)}{p.refundedCents > 0 && <p className="text-[11px] text-muted">−{formatMoney(p.refundedCents)}</p>}</TD>
                        <TD className="text-right">
                          {["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(p.status) && refundable > 0 && (
                            <FormDialog
                              trigger={<Button variant="danger" size="sm">Refund to card</Button>}
                              title="Refund to card via Stripe"
                              description={`Up to ${formatMoney(refundable)}. The same amount is debited from the user's wallet first (requires sufficient balance).`}
                              path={`/api/admin/payments/${p.id}/refund`}
                              fields={[
                                { name: "amountCents", label: "Amount (USD)", type: "number", money: true, required: true, defaultValue: (refundable / 100).toFixed(2) },
                                { name: "reason", label: "Reason", required: true, placeholder: "Customer request" },
                              ]}
                              submitLabel="Refund"
                              success="Refund issued"
                            />
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
              <Pagination page={page} pageSize={pageSize} total={pTotal} basePath="/admin/transactions" params={{ q, status: sp.status }} />
            </>
          )
        ) : ledger.length === 0 ? (
          <EmptyState icon={CreditCard} title="No ledger entries" />
        ) : (
          <>
            <Table>
              <THead>
                <tr><TH>Date</TH><TH>User</TH><TH>Description</TH><TH>Type</TH><TH className="text-right">Amount</TH><TH className="text-right">Balance after</TH><TH>Key</TH></tr>
              </THead>
              <tbody>
                {ledger.map((t) => (
                  <TR key={t.id}>
                    <TD className="whitespace-nowrap text-muted">{formatDate(t.createdAt)}</TD>
                    <TD>{t.wallet.user.email}</TD>
                    <TD>{t.description}</TD>
                    <TD><StatusBadge status={t.type} /></TD>
                    <TD className={`text-right tabular-nums ${t.amountCents > 0 ? "text-green-300" : ""}`}>{t.amountCents > 0 ? "+" : "−"}{formatMoney(Math.abs(t.amountCents))}</TD>
                    <TD className="text-right tabular-nums text-muted">{formatMoney(t.balanceAfterCents)}</TD>
                    <TD className="max-w-[160px] truncate font-mono text-[11px] text-muted">{t.idempotencyKey}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={pageSize} total={lTotal} basePath="/admin/transactions" params={{ q, view: "ledger" }} />
          </>
        )}
      </Card>
    </>
  );
}
