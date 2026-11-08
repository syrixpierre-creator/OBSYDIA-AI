import * as React from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-sm text-foreground placeholder:text-muted/60 transition focus:border-violet-500/60 focus:bg-white/[0.05] focus:outline-none focus:ring-4 focus:ring-violet-500/10 disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(base, "h-10", className)} {...p} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(base, "min-h-[110px] py-2.5", className)} {...p} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <select ref={ref} className={cn(base, "h-10 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%238A8FA3%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:14px] bg-[right_12px_center] bg-no-repeat pr-9", className)} {...p}>
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted", className)} {...p} />;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {error ? <p className="mt-1.5 text-xs text-red-400">{error}</p> : hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
