"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CreditCard, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import { cn, formatMoney } from "@/lib/utils";

export function TopupForm({ presets, min, max, enabled, pendingCheck }: { presets: number[]; min: number; max: number; enabled: boolean; pendingCheck: boolean }) {
  const router = useRouter();
  const [amount, setAmount] = useState<number>(presets[1] ?? presets[0] ?? 1000);
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);

  // After Stripe redirect, the wallet is credited by the webhook — refresh a few times to show it.
  useEffect(() => {
    if (!pendingCheck) return;
    let n = 0;
    const t = setInterval(() => {
      router.refresh();
      if (++n >= 8) clearInterval(t);
    }, 3000);
    return () => clearInterval(t);
  }, [pendingCheck, router]);

  const value = custom ? Math.round(Number(custom) * 100) : amount;
  const valid = Number.isFinite(value) && value >= min && value <= max;

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setAmount(p);
              setCustom("");
            }}
            className={cn(
              "rounded-xl border px-3 py-3 text-sm font-semibold tabular-nums transition",
              !custom && amount === p ? "border-violet-500/60 bg-violet-500/15 text-white shadow-glow" : "border-white/10 bg-white/[0.02] text-muted hover:border-white/20 hover:text-foreground",
            )}
          >
            {formatMoney(p)}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">Custom amount (USD)</label>
        <Input value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ""))} placeholder={`${min / 100} – ${max / 100}`} inputMode="decimal" />
        {custom && !valid && <p className="mt-1.5 text-xs text-red-400">Amount must be between {formatMoney(min)} and {formatMoney(max)}.</p>}
      </div>
      <Button
        className="mt-5 w-full"
        size="lg"
        disabled={!enabled || !valid}
        loading={loading}
        onClick={async () => {
          setLoading(true);
          try {
            const r = await api<{ url: string }>("/api/payments/checkout", "POST", { amountCents: value });
            window.location.href = r.url;
          } catch (e) {
            toast.error((e as Error).message);
            setLoading(false);
          }
        }}
      >
        <CreditCard /> Pay {valid ? formatMoney(value) : ""} with Stripe
      </Button>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted">
        <Lock className="h-3.5 w-3.5" /> Secure payment by Stripe. Your wallet is credited after payment confirmation.
      </p>
    </div>
  );
}
