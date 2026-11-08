"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  Bell,
  Boxes,
  CreditCard,
  Globe2,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  PlusCircle,
  Receipt,
  RotateCcw,
  ScrollText,
  Server,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Tags,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";

const ICONS = {
  Activity, Boxes, CreditCard, Globe2, KeyRound, LayoutDashboard, LifeBuoy, PlusCircle, Receipt, RotateCcw,
  ScrollText, Server, Settings, ShieldCheck, ShoppingBag, ShoppingCart, Tags, Users, Wallet,
} satisfies Record<string, LucideIcon>;
import { Logo } from "@/components/logo";
import { cn, formatMoney, initials, timeAgo } from "@/lib/utils";
import { api } from "@/lib/client-api";

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; exact?: boolean };
type Notif = { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };

export function AppShell({
  children,
  nav,
  user,
  balanceCents,
  notifications,
  area,
  banner,
}: {
  children: React.ReactNode;
  nav: NavItem[];
  user: { name: string; email: string; role: string };
  balanceCents?: number;
  notifications: Notif[];
  area: "user" | "admin";
  banner?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bell, setBell] = useState(false);
  const [notifs, setNotifs] = useState(notifications);
  const unread = notifs.filter((n) => !n.readAt).length;

  const logout = async () => {
    await api("/api/auth/logout", "POST").catch(() => {});
    router.push("/login");
    router.refresh();
  };

  const isActive = (i: NavItem) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + "/"));

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Logo href={area === "admin" ? "/admin" : "/dashboard"} />
        <button className="rounded-lg p-1.5 text-muted lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
      </div>
      {area === "admin" && (
        <div className="mx-4 mb-2 inline-flex items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-violet-200">
          <ShieldCheck className="h-3.5 w-3.5" /> Administration
        </div>
      )}
      <nav className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {nav.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                active ? "bg-white/[0.06] text-foreground" : "text-muted hover:bg-white/[0.03] hover:text-foreground",
              )}
            >
              {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-gradient" />}
              <Icon className={cn("h-[18px] w-[18px]", active ? "text-violet-300" : "text-muted group-hover:text-foreground")} />
              {item.label}
            </Link>
          );
        })}
        <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted transition hover:bg-white/[0.03] hover:text-red-300">
          <LogOut className="h-[18px] w-[18px]" /> Logout
        </button>
      </nav>
      <div className="m-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-gradient text-xs font-bold">{initials(user.name)}</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
        </div>
      </div>
      <p className="pb-4 text-center text-[10px] tracking-[0.25em] text-muted/40">BY INCONNU BOY SENSEI</p>
    </div>
  );

  return (
    <div className="min-h-screen">
      <div className="pointer-events-none fixed left-[20%] top-[-200px] h-[400px] w-[700px] rounded-full bg-violet-600/10 blur-[140px]" />
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-white/[0.06] bg-[#0A0B10]/90 backdrop-blur-xl lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 animate-fade-up border-r border-white/[0.06] bg-[#0A0B10]">{sidebar}</aside>
        </div>
      )}
      <div className="relative lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-white/[0.06] bg-background/70 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-2 text-muted lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <div className="lg:hidden">
              <Logo compact />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {area === "admin" ? (
              <Link href="/dashboard" className="hidden rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted hover:text-foreground sm:block">
                User dashboard
              </Link>
            ) : (
              user.role !== "USER" && (
                <Link href="/admin" className="hidden rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-200 sm:block">
                  Admin panel
                </Link>
              )
            )}
            {balanceCents !== undefined && (
              <Link href="/dashboard/funds" className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm transition hover:border-violet-500/40">
                <Wallet className="h-4 w-4 text-violet-300" />
                <span className="font-semibold tabular-nums">{formatMoney(balanceCents)}</span>
              </Link>
            )}
            <div className="relative">
              <button onClick={() => setBell(!bell)} className="relative rounded-xl border border-white/10 p-2 text-muted transition hover:text-foreground" aria-label="Notifications">
                <Bell className="h-4 w-4" />
                {unread > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-bold text-white">{unread}</span>}
              </button>
              {bell && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setBell(false)} />
                  <div className="absolute right-0 z-50 mt-2 w-[min(92vw,360px)] animate-fade-up overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-glow">
                    <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                      <p className="text-sm font-semibold">Notifications</p>
                      {unread > 0 && (
                        <button
                          className="text-xs text-violet-300 hover:underline"
                          onClick={async () => {
                            await api("/api/notifications/read-all", "POST").catch(() => {});
                            setNotifs(notifs.map((n) => ({ ...n, readAt: new Date().toISOString() })));
                          }}
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="scrollbar-thin max-h-80 overflow-y-auto">
                      {notifs.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-muted">You&apos;re all caught up.</p>
                      ) : (
                        notifs.map((n) => (
                          <Link key={n.id} href={n.link ?? "#"} onClick={() => setBell(false)} className="flex gap-3 border-b border-white/[0.04] px-4 py-3 last:border-0 hover:bg-white/[0.03]">
                            <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-white/10" : "bg-violet-500")} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{n.title}</p>
                              <p className="line-clamp-2 text-xs text-muted">{n.body}</p>
                              <p className="mt-1 text-[10px] text-muted/70">{timeAgo(n.createdAt)}</p>
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        {banner}
        <main className="relative mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
