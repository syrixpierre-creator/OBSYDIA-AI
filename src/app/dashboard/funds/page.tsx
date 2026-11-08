import { AlertTriangle, CheckCircle2, ShieldCheck, Wallet, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ensureWallet } from "@/lib/wallet";
import { cardPaymentsAvailable } from "@/lib/payments-status";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { TopupForm } from "@/components/app/topup-form";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata = { title: "Add Funds" };

export default async function FundsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [wallet, card, recent] = await Promise.all([
    ensureWallet(user.id),
    cardPaymentsAvailable(),
    db.payment.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  const returned = sp.checkout === "success" && sp.payment ? recent.find((p) => p.id === sp.payment) : undefined;

  return (
    <>
      <PageHeader title="Add Funds" description="Top up your wallet to buy numbers instantly." />
      {returned && (
        <div className={`mb-4 flex items-center gap-3 rounded-2xl border p-4 text-sm ${returned.status === "SUCCEEDED" ? "border-success/25 bg-success/[0.06] text-green-100" : "border-electric-500/25 bg-electric-500/[0.06] text-blue-100"}`}>
          {returned.status === "SUCCEEDED" ? <CheckCircle2 className="h-5 w-5 text-success" /> : <ShieldCheck className="h-5 w-5 text-blue-300" />}
          {returned.status === "SUCCEEDED"
            ? `Payment confirmed — ${formatMoney(returned.amountCents)} has been added to your wallet.`
            : "Payment received by Stripe. Waiting for secure confirmation — your balance will update automatically."}
        </div>
      )}
      {sp.checkout === "cancelled" && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-muted">
          <XCircle className="h-5 w-5" /> Checkout cancelled. No payment was taken.
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Choose an amount</CardTitle>
              <CardDescription>
                Between {formatMoney(card.settings.minTopupCents)} and {formatMoney(card.settings.maxTopupCents)}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {!card.topup && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-warning/25 bg-warning/[0.06] p-3 text-sm text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Card payments are not configured yet. An administrator must add Stripe keys in Admin → Settings & Stripe.
              </div>
            )}
            <TopupForm
              presets={card.settings.presetAmountsCents}
              min={card.settings.minTopupCents}
              max={card.settings.maxTopupCents}
              enabled={card.topup}
              pendingCheck={Boolean(returned && returned.status === "PENDING")}
            />
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card className="glow-ring">
            <CardContent>
              <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted">
                <Wallet className="h-4 w-4 text-violet-300" /> Current balance
              </p>
              <p className="mt-2 text-4xl font-semibold tabular-nums">{formatMoney(wallet.balanceCents)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Recent payments</CardTitle>
            </CardHeader>
            <CardContent>
              {recent.length === 0 ? (
                <p className="text-sm text-muted">No payments yet.</p>
              ) : (
                <ul className="divide-y divide-white/[0.05]">
                  {recent.map((p) => (
                    <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                      <div>
                        <p className="tabular-nums">{formatMoney(p.amountCents)}</p>
                        <p className="text-xs text-muted">{formatDate(p.createdAt)}</p>
                      </div>
                      <StatusBadge status={p.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
