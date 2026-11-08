import Link from "next/link";
import { Logo } from "@/components/logo";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="grid-bg pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute left-1/2 top-[-160px] h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-violet-600/20 blur-[130px]" />
      <header className="container relative flex h-16 items-center justify-between">
        <Logo />
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          Back to site
        </Link>
      </header>
      <main className="relative flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[420px] animate-fade-up">
          <div className="glow-ring card p-6 sm:p-8">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
          {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
        </div>
      </main>
      <footer className="relative py-6 text-center text-[11px] tracking-[0.25em] text-muted/50">BY INCONNU BOY SENSEI</footer>
    </div>
  );
}
