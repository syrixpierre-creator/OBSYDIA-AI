import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "border-white/10 bg-white/[0.04] text-muted",
  violet: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  blue: "border-electric-500/30 bg-electric-500/10 text-blue-300",
  green: "border-success/30 bg-success/10 text-green-300",
  amber: "border-warning/30 bg-warning/10 text-amber-300",
  red: "border-danger/30 bg-danger/10 text-red-300",
} as const;

export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", className, dot, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium", tones[tone], className)} {...p}>
      {dot && <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-current" />}
      {p.children}
    </span>
  );
}

const statusTone: Record<string, Tone> = {
  PENDING: "amber",
  ACTIVE: "blue",
  RECEIVED: "green",
  COMPLETED: "violet",
  CANCELLED: "neutral",
  EXPIRED: "neutral",
  FAILED: "red",
  SUCCEEDED: "green",
  REFUNDED: "violet",
  PARTIALLY_REFUNDED: "violet",
  OPEN: "blue",
  ANSWERED: "green",
  CLOSED: "neutral",
  SUSPENDED: "red",
  REJECTED: "red",
  CREDIT: "green",
  DEBIT: "neutral",
  REFUND: "violet",
  ADJUSTMENT: "amber",
  WITHDRAWAL: "amber",
};

export function StatusBadge({ status }: { status: string }) {
  const live = status === "ACTIVE" || status === "PENDING";
  return (
    <Badge tone={statusTone[status] ?? "neutral"} dot={live}>
      {status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
    </Badge>
  );
}
