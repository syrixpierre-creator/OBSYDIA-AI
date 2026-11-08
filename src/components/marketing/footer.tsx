import Link from "next/link";
import { Logo } from "@/components/logo";

const cols = [
  { title: "Platform", links: [["Services & pricing", "/services"], ["Get started", "/register"], ["Login", "/login"]] },
  { title: "Developers", links: [["API documentation", "/docs/api"], ["API access", "/dashboard/api"], ["Webhooks", "/docs/api#webhooks"]] },
  { title: "Legal", links: [["Terms of service", "/legal/terms"], ["Acceptable use", "/legal/acceptable-use"], ["Privacy", "/legal/privacy"]] },
];

export function Footer() {
  return (
    <footer className="relative border-t border-white/[0.06]">
      <div className="container grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">Your Numbers. Your World. Virtual numbers and SMS services for authorized, legitimate use.</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground/80">{c.title}</h4>
            <ul className="mt-4 space-y-2.5">
              {c.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-muted transition hover:text-foreground">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/[0.06]">
        <div className="container flex flex-col items-center justify-between gap-2 py-6 text-xs text-muted sm:flex-row">
          <span>© {new Date().getFullYear()} INCONNU SMS. All rights reserved.</span>
          <span className="tracking-[0.25em] text-muted/60">BY INCONNU BOY SENSEI</span>
        </div>
      </div>
    </footer>
  );
}
