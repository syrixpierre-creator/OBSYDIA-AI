import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...p }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="scrollbar-thin w-full overflow-x-auto">
      <table className={cn("w-full min-w-[640px] border-collapse text-sm", className)} {...p} />
    </div>
  );
}
export function THead(p: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...p} className={cn("border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-muted", p.className)} />;
}
export function TH({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("px-4 py-3 font-medium first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6", className)} {...p} />;
}
export function TR({ className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.02]", className)} {...p} />;
}
export function TD({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3.5 align-middle first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6", className)} {...p} />;
}
