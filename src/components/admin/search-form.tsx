import { Search } from "lucide-react";

/** GET form for server-side search/filter (works without JS). */
export function SearchForm({ action, q, placeholder, children }: { action: string; q?: string; placeholder?: string; children?: React.ReactNode }) {
  return (
    <form action={action} className="mb-4 flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          name="q"
          defaultValue={q}
          placeholder={placeholder ?? "Search…"}
          className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-10 pr-3 text-sm placeholder:text-muted/60 focus:border-violet-500/60 focus:outline-none focus:ring-4 focus:ring-violet-500/10"
        />
      </div>
      {children}
      <button className="h-10 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm hover:bg-white/[0.07]">Search</button>
    </form>
  );
}
