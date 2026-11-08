"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CopyButton({ value, className, label }: { value: string; className?: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value).catch(() => {});
        setDone(true);
        toast.success(label ? `${label} copied` : "Copied to clipboard");
        setTimeout(() => setDone(false), 1500);
      }}
      className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-muted transition hover:border-violet-500/40 hover:text-foreground", className)}
      aria-label="Copy"
    >
      {done ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
