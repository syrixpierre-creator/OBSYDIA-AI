import { compact } from "../lib/api";

export function Bars({ data, locale }: { data: { day: string; value: number }[]; locale: string }) {
  const days: { day: string; value: number }[] = [];
  const map = new Map(data.map((d) => [d.day, d.value]));
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    days.push({ day: d, value: map.get(d) || 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.value));
  return (
    <div>
      <div className="bars" role="img" aria-label="Usage chart">
        {days.map((d) => (
          <div key={d.day} style={{ height: `${(d.value / max) * 100}%` }} title={`${d.day}: ${compact(d.value, locale)}`} />
        ))}
      </div>
      <div className="bars-x">
        <span>{days[0]!.day.slice(5)}</span>
        <span>{days[days.length - 1]!.day.slice(5)}</span>
      </div>
    </div>
  );
}
