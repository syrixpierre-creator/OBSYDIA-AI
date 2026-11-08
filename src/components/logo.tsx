import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand-gradient shadow-[0_0_24px_-4px_rgba(139,92,246,0.8)]", className)}>
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] text-white" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4 4v-4h0.5A2.5 2.5 0 0 1 5 13.5z" />
        <path d="M9.5 10h.01M12 10h.01M14.5 10h.01" />
      </svg>
    </span>
  );
}

export function Logo({ href = "/", className, compact }: { href?: string; className?: string; compact?: boolean }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5", className)} aria-label="INCONNU SMS home">
      <LogoMark />
      {!compact && (
        <span className="text-[15px] font-extrabold tracking-[0.14em]">
          INCONNU <span className="text-gradient">SMS</span>
        </span>
      )}
    </Link>
  );
}
