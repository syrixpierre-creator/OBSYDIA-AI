"use client";
import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/#features", label: "Features" },
  { href: "/services", label: "Services" },
  { href: "/#api", label: "API" },
  { href: "/#security", label: "Security" },
  { href: "/#faq", label: "FAQ" },
];

export function Navbar({ loggedIn }: { loggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-background/70 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm text-muted transition hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {loggedIn ? (
            <Button asChild size="sm">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Login</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Register</Link>
              </Button>
            </>
          )}
        </div>
        <button className="rounded-lg p-2 text-muted md:hidden" onClick={() => setOpen(!open)} aria-label="Toggle menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-white/[0.06] bg-background/95 px-4 pb-4 md:hidden">
          <nav className="flex flex-col py-2">
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-2 py-2.5 text-sm text-muted hover:text-foreground">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="grid grid-cols-2 gap-2">
            {loggedIn ? (
              <Button asChild className="col-span-2">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="secondary">
                  <Link href="/login">Login</Link>
                </Button>
                <Button asChild>
                  <Link href="/register">Register</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
