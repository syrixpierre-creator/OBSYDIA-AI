"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, FlaskConical, LifeBuoy, MessageSquareText, Phone, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Confirm } from "@/components/ui/confirm";
import { CopyButton } from "@/components/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { api, withToast } from "@/lib/client-api";
import { flagEmoji, formatDate, formatMoney } from "@/lib/utils";

export type OrderDTO = {
  id: string;
  status: string;
  phone_number: string | null;
  country: { code: string; name: string };
  service: { code: string; name: string };
  price_cents: number;
  demo: boolean;
  expires_at: string | null;
  created_at: string;
  completed_at: string | null;
  failure_reason: string | null;
  sms: { id: string; sender: string | null; text: string; code: string | null; received_at: string }[];
};

function useCountdown(to: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!to) return null;
  const ms = Math.max(0, new Date(to).getTime() - now);
  return { ms, label: `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}` };
}

export function OrderLive({ initial }: { initial: OrderDTO }) {
  const router = useRouter();
  const [order, setOrder] = useState(initial);
  const live = ["PENDING", "ACTIVE", "RECEIVED"].includes(order.status);
  const countdown = useCountdown(live ? order.expires_at : null);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(async () => {
      try {
        const r = await api<{ order: OrderDTO }>(`/api/orders/${order.id}`);
        setOrder((prev) => {
          if (r.order.sms.length > prev.sms.length || r.order.status !== prev.status) router.refresh();
          return r.order;
        });
      } catch {
        /* transient */
      }
    }, 4000);
    return () => clearInterval(t);
  }, [live, order.id, router]);

  const total = order.expires_at ? new Date(order.expires_at).getTime() - new Date(order.created_at).getTime() : 1;
  const pct = countdown ? Math.min(100, (countdown.ms / total) * 100) : 0;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
      <div className="space-y-4">
        <Card className="glow-ring relative overflow-hidden">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-600/20 blur-3xl" />
          <CardContent className="relative">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-4xl">{flagEmoji(order.country.code)}</span>
                <div>
                  <p className="text-lg font-semibold">{order.service.name}</p>
                  <p className="text-sm text-muted">{order.country.name}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <StatusBadge status={order.status} />
                {order.demo && (
                  <Badge tone="amber">
                    <FlaskConical className="h-3 w-3" /> Demo
                  </Badge>
                )}
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-white/[0.07] bg-surface-2/80 p-4">
              <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted">
                <Phone className="h-3.5 w-3.5" /> Your number
              </p>
              {order.phone_number ? (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="font-mono text-2xl font-semibold tracking-wide sm:text-[28px]">{order.phone_number}</p>
                  <CopyButton value={order.phone_number.replace(/\s/g, "")} label="Number" />
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted">{order.status === "PENDING" ? "Waiting for supplier confirmation…" : "No number was assigned."}</p>
              )}
              {live && countdown && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> Expires in
                    </span>
                    <span className="font-mono tabular-nums text-foreground">{countdown.label}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-brand-gradient transition-all duration-1000" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )}
            </div>

            {order.failure_reason && <p className="mt-4 rounded-xl border border-danger/20 bg-danger/[0.06] p-3 text-sm text-red-200">{order.failure_reason}</p>}

            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-white/[0.06] p-3">
                <dt className="text-[11px] uppercase tracking-wider text-muted">Price</dt>
                <dd className="mt-1 font-medium tabular-nums">{formatMoney(order.price_cents)}</dd>
              </div>
              <div className="rounded-xl border border-white/[0.06] p-3">
                <dt className="text-[11px] uppercase tracking-wider text-muted">Created</dt>
                <dd className="mt-1 font-medium">{formatDate(order.created_at)}</dd>
              </div>
            </dl>

            <div className="mt-5 flex flex-wrap gap-2">
              {order.status === "ACTIVE" && order.sms.length === 0 && (
                <Confirm
                  title="Cancel this number?"
                  description="The number will be released and the full amount refunded to your wallet."
                  confirmLabel="Cancel & refund"
                  tone="danger"
                  onConfirm={async () => {
                    const r = await withToast(api<{ order: OrderDTO }>(`/api/orders/${order.id}/cancel`, "POST"), "Order cancelled and refunded");
                    if (r) {
                      setOrder(r.order);
                      router.refresh();
                    }
                  }}
                >
                  <Button variant="danger" size="sm">
                    <XCircle /> Cancel & refund
                  </Button>
                </Confirm>
              )}
              {order.status === "RECEIVED" && (
                <Button
                  variant="success"
                  size="sm"
                  onClick={async () => {
                    const r = await withToast(api<{ order: OrderDTO }>(`/api/orders/${order.id}/complete`, "POST"), "Order completed");
                    if (r) setOrder(r.order);
                  }}
                >
                  <CheckCircle2 /> Mark as completed
                </Button>
              )}
              <Button asChild variant="ghost" size="sm">
                <Link href={`/dashboard/support?order=${order.id}`}>
                  <LifeBuoy /> Report a problem
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Messages</CardTitle>
            <CardDescription>{live ? "Refreshing automatically every few seconds." : "Messages received for this number."}</CardDescription>
          </div>
          {live && (
            <Badge tone="blue" dot>
              Live
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {order.sms.length === 0 ? (
            <EmptyState
              icon={MessageSquareText}
              title={live ? "Waiting for SMS…" : "No messages"}
              description={live ? "Use the number on the service you selected. The code will appear here instantly." : "No SMS was received for this order."}
            />
          ) : (
            <ul className="space-y-3">
              {order.sms.map((s) => (
                <li key={s.id} className="animate-fade-up rounded-2xl border border-success/20 bg-success/[0.05] p-4">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>{s.sender ?? "Unknown sender"}</span>
                    <span>{formatDate(s.received_at)}</span>
                  </div>
                  {s.code && (
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="font-mono text-3xl font-bold tracking-[0.25em] text-green-200">{s.code}</p>
                      <CopyButton value={s.code} label="Code" />
                    </div>
                  )}
                  <p className="mt-3 break-words text-sm text-foreground/85">{s.text}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
