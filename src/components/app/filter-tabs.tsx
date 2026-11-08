import Link from "next/link";
import { cn } from "@/lib/utils";

export function FilterTabs({ tabs, param, current, basePath, extra = {} }: { tabs: { value: string; label: string }[]; param: string; current: string; basePath: string; extra?: Record<string, string | undefined> }) {
  return (
    <div className="scrollbar-thin mb-4 flex gap-1 overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.02] p-1 sm:inline-flex">
      {tabs.map((t) => {
        const sp = new URLSearchParams();
        Object.entries(extra).forEach(([k, v]) => v && sp.set(k, v));
        if (t.value) sp.set(param, t.value);
        const qs = sp.toString();
        return (
          <Link
            key={t.value}
            href={`${basePath}${qs ? `?${qs}` : ""}`}
            className={cn("whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition", current === t.value ? "bg-white/[0.08] text-foreground" : "text-muted hover:text-foreground")}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
