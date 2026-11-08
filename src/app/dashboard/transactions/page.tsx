import type { Prisma } from "@prisma/client";
import { Receipt } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ensureWallet } from "@/lib/wallet";
import { PageHeader } from "@/components/app/app-shell";
import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, pageParams } from "@/components/ui/pagination";
import { FilterTabs } from "@/components/app/filter-tabs";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const view = sp.view === "payments" ? "payments" : "ledger";
  const { page, pageSize, skip, take } = pageParams(sp);
  const wallet = await ensureWallet(user.id);

  const types = ["CREDIT", "DEBIT", "REFUND", "ADJUSTMENT", "WITHDRAWAL"];
  const where: Prisma.WalletTransactionWhereInput = { walletId: wallet.id, ...(types.includes(sp.type) ? { type: sp.type as never } : {}) };
  const [rows, total, payments, paymentsTotal] = await Promise.all([
    view === "ledger" ? db.walletTransaction.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }) : [],
    view === "ledger" ? db.walletTransaction.count({ where }) : 0,
    view === "payments" ? db.payment.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, skip, take }) : [],
    view === "payments" ? db.payment.count({ where: { userId: user.id } }) : 0,
  ]);

  return (
    <>
      <PageHeader title="Transactions" description="Your complete wallet ledger and card payment history." />
      <FilterTabs
        tabs={[{ value: "", label: "Wallet ledger" }, { value: "payments", label: "Card payments" }]}
        param="view"
        current={view === "payments" ? "payments" : ""}
        basePath="/dashboard/transactions"
      />
      {view === "ledger" && (
        <FilterTabs
          tabs={[{ value: "", label: "All types" }, ...types.map((t) => ({ value: t, label: t.charAt(0) + t.slice(1).toLowerCase() }))]}
          param="type"
          current={sp.type ?? ""}
          basePath="/dashboard/transactions"
        />
      )}
      <Card>
        {view === "ledger" ? (
          rows.length === 0 ? (
            <EmptyState icon={Receipt} title="No transactions" description="Wallet movements will appear here." />
          ) : (
            <>
              <Table>
                <THead>
                  <tr>
                    <TH>Date</TH>
                    <TH>Description</TH>
                    <TH>Type</TH>
                    <TH className="text-right">Amount</TH>
                    <TH className="text-right">Balance after</TH>
                  </tr>
                </THead>
                <tbody>
                  {rows.map((t) => (
                    <TR key={t.id}>
                      <TD className="whitespace-nowrap text-muted">{formatDate(t.createdAt)}</TD>
                      <TD>{t.description}</TD>
                      <TD><StatusBadge status={t.type} /></TD>
                      <TD className={`text-right font-medium tabular-nums ${t.amountCents > 0 ? "text-green-300" : ""}`}>
                        {t.amountCents > 0 ? "+" : "−"}{formatMoney(Math.abs(t.amountCents))}
                      </TD>
                      <TD className="text-right tabular-nums text-muted">{formatMoney(t.balanceAfterCents)}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
              <Pagination page={page} pageSize={pageSize} total={total} basePath="/dashboard/transactions" params={{ type: sp.type }} />
            </>
          )
        ) : payments.length === 0 ? (
          <EmptyState icon={Receipt} title="No card payments" description="Your Stripe payments will appear here." />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Reference</TH>
                  <TH>Purpose</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Amount</TH>
                </tr>
              </THead>
              <tbody>
                {payments.map((p) => (
                  <TR key={p.id}>
                    <TD className="whitespace-nowrap text-muted">{formatDate(p.createdAt)}</TD>
                    <TD className="font-mono text-xs">{p.id.slice(-10).toUpperCase()}</TD>
                    <TD>{p.purpose === "TOPUP" ? "Wallet top-up" : "Number purchase"}</TD>
                    <TD><StatusBadge status={p.status} /></TD>
                    <TD className="text-right font-medium tabular-nums">
                      {formatMoney(p.amountCents)}
                      {p.refundedCents > 0 && <span className="block text-xs text-muted">−{formatMoney(p.refundedCents)} refunded</span>}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={pageSize} total={paymentsTotal} basePath="/dashboard/transactions" params={{ view: "payments" }} />
          </>
        )}
      </Card>
    </>
  );
}
