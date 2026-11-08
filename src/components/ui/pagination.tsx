import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination({ page, pageSize, total, basePath, params = {} }: { page: number; pageSize: number; total: number; basePath: string; params?: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && sp.set(k, v));
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  const btn = "inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 px-3 text-xs transition hover:bg-white/5";
  return (
    <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-3 text-xs text-muted sm:px-6">
      <span>
        Page {page} of {pages} · {total} results
      </span>
      <div className="flex gap-2">
        <Link aria-disabled={page <= 1} className={cn(btn, page <= 1 && "pointer-events-none opacity-40")} href={href(page - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </Link>
        <Link aria-disabled={page >= pages} className={cn(btn, page >= pages && "pointer-events-none opacity-40")} href={href(page + 1)}>
          Next <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

export function pageParams(sp: Record<string, string | string[] | undefined>, pageSize = 20) {
  const page = Math.max(1, Number(sp.page) || 1);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
