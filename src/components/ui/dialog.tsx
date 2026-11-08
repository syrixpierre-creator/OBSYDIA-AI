"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ className, children, title, description }: { className?: string; children: React.ReactNode; title: string; description?: string }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-[fade-up_.2s_ease-out]" />
      <D.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/10 bg-surface p-6 shadow-glow focus:outline-none",
          className,
        )}
      >
        <D.Title className="pr-8 text-base font-semibold">{title}</D.Title>
        {description ? <D.Description className="mt-1 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
        <div className="mt-5">{children}</div>
        <D.Close className="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition hover:bg-white/5 hover:text-foreground" aria-label="Close">
          <X className="h-4 w-4" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
