"use client";
import { cn } from "@/lib/utils";

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50",
        checked ? "border-violet-500/50 bg-violet-600" : "border-white/10 bg-white/10",
      )}
    >
      <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-[3px]")} />
    </button>
  );
}
