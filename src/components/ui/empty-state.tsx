import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({ icon: Icon, title, description, action, className }: { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <div className="relative mb-4">
        <div className="absolute inset-0 rounded-2xl bg-violet-500/20 blur-xl" />
        <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-surface-2">
          <Icon className="h-5 w-5 text-violet-400" />
        </div>
      </div>
      <h4 className="text-sm font-semibold">{title}</h4>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
