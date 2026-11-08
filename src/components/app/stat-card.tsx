import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({ label, value, icon: Icon, hint, accent }: { label: string; value: string; icon: LucideIcon; hint?: string; accent?: boolean }) {
  return (
    <div className={cn("card relative overflow-hidden p-5", accent && "glow-ring")}>
      {accent && <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-violet-600/25 blur-2xl" />}
      <div className="relative flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
          <Icon className="h-4 w-4 text-violet-300" />
        </span>
      </div>
      <p className="relative mt-3 text-2xl font-semibold tracking-tight tabular-nums sm:text-[28px]">{value}</p>
      {hint && <p className="relative mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
