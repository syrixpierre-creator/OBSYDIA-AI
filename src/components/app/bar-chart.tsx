import { formatMoney } from "@/lib/utils";

/** Lightweight CSS bar chart (no client JS). */
export function BarChart({ data, money = true }: { data: { label: string; value: number }[]; money?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-44 items-end gap-1.5">
      {data.map((d) => (
        <div key={d.label} className="group relative flex h-full flex-1 flex-col justify-end">
          <div
            className="w-full rounded-t-md bg-gradient-to-t from-violet-600/70 to-electric-500/80 transition group-hover:from-violet-500 group-hover:to-electric-400"
            style={{ height: `${Math.max(d.value > 0 ? 4 : 1.5, (d.value / max) * 100)}%`, opacity: d.value > 0 ? 1 : 0.25 }}
          />
          <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-surface-3 px-2 py-1 text-[10px] group-hover:block">
            {d.label}: {money ? formatMoney(d.value) : d.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function lastNDays(n: number) {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) days.push(new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10));
  return days;
}
