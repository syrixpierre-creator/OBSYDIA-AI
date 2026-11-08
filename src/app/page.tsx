import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Code2,
  Fingerprint,
  Gauge,
  Globe2,
  KeyRound,
  Layers,
  Lock,
  MessageSquareText,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Wallet,
  Webhook,
  Zap,
} from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function getStats() {
  // Real figures only — straight from the database.
  const [users, payments, orders, countries, services] = await Promise.all([
    db.user.count(),
    db.payment.count({ where: { status: { in: ["SUCCEEDED", "REFUNDED", "PARTIALLY_REFUNDED"] } } }),
    db.order.count({ where: { status: { in: ["ACTIVE", "RECEIVED", "COMPLETED"] } } }),
    db.country.count({ where: { enabled: true, offerings: { some: { enabled: true, available: { gt: 0 }, provider: { enabled: true } } } } }),
    db.service.count({ where: { enabled: true, offerings: { some: { enabled: true, available: { gt: 0 }, provider: { enabled: true } } } } }),
  ]);
  return { users, transactions: payments + orders, countries, services };
}

const features = [
  { icon: Globe2, title: "Global coverage", text: "Countries and services are pulled automatically from connected suppliers — always up to date." },
  { icon: MessageSquareText, title: "Instant SMS reception", text: "Codes are detected and highlighted the moment they arrive, with live status updates." },
  { icon: Wallet, title: "Prepaid wallet", text: "Top up once with Stripe, buy in one click. Every movement is recorded in an atomic ledger." },
  { icon: RefreshCcw, title: "Automatic refunds", text: "No SMS before expiry? The order is closed and your wallet refunded automatically." },
  { icon: Code2, title: "Developer API", text: "A clean REST API with keys, rate limits, idempotency and signed webhooks for resellers." },
  { icon: Layers, title: "Multi-provider engine", text: "Provider-agnostic adapters route each order to the best available supplier." },
];

const advantages = [
  "Real-time availability — a number is only shown once the supplier confirms it",
  "Transparent pricing per country and service",
  "No duplicate charges: idempotent orders and payments",
  "Card payments secured by Stripe Checkout",
  "Detailed order history and exportable ledger",
  "Responsive dashboard on desktop, tablet and mobile",
];

const faqs = [
  {
    q: "How does it work?",
    a: "Create an account, add funds to your wallet, pick a service and a country, then buy. A number is reserved with our supplier and any SMS it receives appears instantly in your dashboard.",
  },
  {
    q: "What happens if I don't receive an SMS?",
    a: "If no SMS arrives before the number expires, the order is closed and the full amount is refunded to your wallet automatically. You can also cancel an active order before an SMS arrives when the supplier allows it.",
  },
  {
    q: "Which payment methods are accepted?",
    a: "Card payments via Stripe Checkout. Funds are credited only after Stripe confirms the payment through a signed webhook.",
  },
  {
    q: "Can I integrate INCONNU SMS into my application?",
    a: "Yes. Generate an API key in the API Access section and use our REST API to list prices, create orders and retrieve SMS. Webhooks notify your server in real time.",
  },
  {
    q: "What usage is allowed?",
    a: "Only lawful, authorized use that respects the terms of the destination platforms. Fraud, spam, harassment, bypassing bans or impersonation are strictly prohibited and lead to account suspension.",
  },
];

export default async function Home() {
  const [stats, user] = await Promise.all([getStats(), getCurrentUser()]);
  const statItems = [
    { label: "Registered users", value: stats.users },
    { label: "Transactions", value: stats.transactions },
    { label: "Countries available", value: stats.countries },
    { label: "Services available", value: stats.services },
  ];

  return (
    <div className="relative overflow-x-hidden">
      <Navbar loggedIn={Boolean(user)} />

      {/* HERO */}
      <section className="relative">
        <div className="grid-bg pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute left-1/2 top-[-200px] h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-violet-600/25 blur-[140px]" />
        <div className="pointer-events-none absolute right-[-120px] top-[180px] h-[320px] w-[420px] rounded-full bg-electric-500/15 blur-[120px]" />
        <div className="container relative grid items-center gap-14 pb-20 pt-16 md:pt-24 lg:grid-cols-[1.1fr_1fr]">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs text-violet-200">
              <Sparkles className="h-3.5 w-3.5" /> Your Numbers. Your World.
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Your Global <span className="text-gradient">Virtual Number</span> Platform
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              Access virtual numbers, manage SMS services and automate your workflow through one powerful platform.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href={user ? "/dashboard/buy" : "/register"}>
                  Get Started <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/services">Explore Services</Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-violet-400" /> Stripe secured</span>
              <span className="inline-flex items-center gap-1.5"><Zap className="h-4 w-4 text-violet-400" /> Instant delivery</span>
              <span className="inline-flex items-center gap-1.5"><RefreshCcw className="h-4 w-4 text-violet-400" /> Auto-refund</span>
            </div>
          </div>

          {/* Product preview (illustrative UI) */}
          <div className="relative animate-fade-up [animation-delay:120ms]">
            <div className="absolute -inset-6 rounded-[32px] bg-gradient-to-br from-violet-600/20 to-electric-500/10 blur-2xl" />
            <div className="glow-ring card relative rounded-[22px] p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
                  <span className="ml-2">Order preview</span>
                </div>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">Interface preview</span>
              </div>
              <div className="mt-5 rounded-2xl border border-white/[0.07] bg-surface-2 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted">Virtual number</p>
                    <p className="mt-1 font-mono text-lg font-semibold tracking-wide sm:text-xl">+00 ••• ••• •••</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-electric-500/30 bg-electric-500/10 px-2 py-0.5 text-[11px] text-blue-300">
                    <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-current" /> Waiting for SMS
                  </span>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full w-2/3 rounded-full bg-brand-gradient" />
                </div>
              </div>
              <div className="mt-3 rounded-2xl border border-success/20 bg-success/[0.06] p-4">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-green-300/80">
                  <span>Code received</span>
                  <BadgeCheck className="h-4 w-4" />
                </div>
                <p className="mt-2 font-mono text-3xl font-bold tracking-[0.3em] text-green-200">• • • • • •</p>
                <p className="mt-2 text-xs text-muted">Verification codes are extracted and highlighted automatically.</p>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {[
                  ["Service", "Your choice"],
                  ["Country", "Worldwide"],
                  ["Delivery", "Real time"],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted">{k}</p>
                    <p className="mt-1 text-sm font-medium">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* LIVE STATS */}
        <div className="container relative pb-20">
          <div className="card grid grid-cols-2 divide-white/[0.06] overflow-hidden md:grid-cols-4 md:divide-x">
            {statItems.map((s) => (
              <div key={s.label} className="p-6 text-center">
                <p className="text-3xl font-bold tracking-tight sm:text-4xl">{formatNumber(s.value)}</p>
                <p className="mt-1 text-xs uppercase tracking-wider text-muted">{s.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] text-muted/70">Live figures from the platform database.</p>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="relative scroll-mt-20 py-20">
        <div className="container">
          <SectionTitle eyebrow="Features" title="Everything you need to receive SMS at scale" text="A complete platform: catalog, wallet, orders, API and administration — built for speed and reliability." />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="card group p-6 transition duration-300 hover:-translate-y-0.5 hover:border-violet-500/30">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10 text-violet-300 transition group-hover:shadow-glow">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS + ADVANTAGES */}
      <section className="py-20">
        <div className="container grid gap-10 lg:grid-cols-2">
          <div>
            <SectionTitle align="left" eyebrow="How it works" title="Three steps, a few seconds" />
            <ol className="mt-10 space-y-4">
              {[
                ["Add funds", "Top up your wallet securely with Stripe Checkout."],
                ["Choose service & country", "Compare live prices and availability, then buy in one click."],
                ["Receive your code", "Your number appears once confirmed. SMS arrive in real time."],
              ].map(([t, d], i) => (
                <li key={t} className="card flex gap-4 p-5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-sm font-bold">{i + 1}</span>
                  <div>
                    <p className="font-medium">{t}</p>
                    <p className="mt-1 text-sm text-muted">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="card glow-ring p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Advantages</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight">Built for trust</h3>
            <ul className="mt-6 space-y-3.5">
              {advantages.map((a) => (
                <li key={a} className="flex gap-3 text-sm text-foreground/90">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" /> {a}
                </li>
              ))}
            </ul>
            <Button asChild className="mt-8">
              <Link href="/services">
                View services & prices <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* API */}
      <section id="api" className="relative scroll-mt-20 py-20">
        <div className="pointer-events-none absolute left-0 top-1/3 h-[300px] w-[400px] rounded-full bg-electric-500/10 blur-[120px]" />
        <div className="container grid items-center gap-12 lg:grid-cols-2">
          <div>
            <SectionTitle align="left" eyebrow="Developer API" title="Automate everything with our REST API" text="Integrate virtual numbers into your product or resell them under your own brand." />
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                [KeyRound, "API keys", "Create & revoke keys per project"],
                [Gauge, "Rate limiting", "Per-key quotas with clear headers"],
                [Webhook, "Signed webhooks", "HMAC-SHA256 real-time events"],
                [Fingerprint, "Idempotency", "Never pay twice for a retry"],
              ].map(([Icon, t, d]) => {
                const I = Icon as typeof KeyRound;
                return (
                  <div key={t as string} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <I className="h-4 w-4 text-violet-400" />
                    <p className="mt-2 text-sm font-medium">{t as string}</p>
                    <p className="text-xs text-muted">{d as string}</p>
                  </div>
                );
              })}
            </div>
            <Button asChild variant="secondary" className="mt-8">
              <Link href="/docs/api">
                Read the documentation <ArrowRight />
              </Link>
            </Button>
          </div>
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3 text-xs text-muted">
              <Code2 className="h-4 w-4" /> POST /api/v1/orders
            </div>
            <pre className="scrollbar-thin overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed text-foreground/90">
              <code>
                <span className="text-muted">$</span> curl -X POST https://your-domain/api/v1/orders \{"\n"}
                {"  "}-H <span className="text-green-300">&quot;Authorization: Bearer isk_live_…&quot;</span> \{"\n"}
                {"  "}-H <span className="text-green-300">&quot;Idempotency-Key: 7f3c…&quot;</span> \{"\n"}
                {"  "}-d <span className="text-green-300">&apos;{"{"}&quot;country&quot;:&quot;FR&quot;,&quot;service&quot;:&quot;telegram&quot;{"}"}&apos;</span>
                {"\n\n"}
                <span className="text-violet-300">{"{"}</span>
                {"\n"}
                {"  "}<span className="text-blue-300">&quot;data&quot;</span>: {"{"}
                {"\n"}
                {"    "}<span className="text-blue-300">&quot;id&quot;</span>: <span className="text-green-300">&quot;cm4…&quot;</span>,{"\n"}
                {"    "}<span className="text-blue-300">&quot;status&quot;</span>: <span className="text-green-300">&quot;ACTIVE&quot;</span>,{"\n"}
                {"    "}<span className="text-blue-300">&quot;phone_number&quot;</span>: <span className="text-green-300">&quot;+33 …&quot;</span>,{"\n"}
                {"    "}<span className="text-blue-300">&quot;expires_at&quot;</span>: <span className="text-green-300">&quot;…&quot;</span>
                {"\n"}
                {"  "}{"}"}
                {"\n"}
                <span className="text-violet-300">{"}"}</span>
              </code>
            </pre>
          </div>
        </div>
      </section>

      {/* SECURITY */}
      <section id="security" className="scroll-mt-20 py-20">
        <div className="container">
          <SectionTitle eyebrow="Security" title="Security is not an option" text="Every layer is designed to protect your account, your money and your data." />
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              [Lock, "Secrets stay server-side", "API keys and payment secrets never reach the browser. Stored secrets are AES-256-GCM encrypted."],
              [ShieldCheck, "Verified payments", "Funds are credited only after a Stripe webhook with a verified signature — never on a redirect."],
              [Fingerprint, "Hardened accounts", "bcrypt password hashing, httpOnly sessions, CSRF & rate-limit protections and full audit logs."],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof Lock;
              return (
                <div key={t as string} className="card p-6">
                  <I className="h-5 w-5 text-violet-400" />
                  <h3 className="mt-4 font-semibold">{t as string}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{d as string}</p>
                </div>
              );
            })}
          </div>
          <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-muted">
            INCONNU SMS is intended for lawful and authorized use only. Customers must comply with the terms of the destination platforms. Abuse leads to immediate suspension —
            see our <Link className="text-violet-300 hover:underline" href="/legal/acceptable-use">Acceptable Use Policy</Link>.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 py-20">
        <div className="container max-w-3xl">
          <SectionTitle eyebrow="FAQ" title="Frequently asked questions" />
          <div className="mt-10 space-y-3">
            {faqs.map((f) => (
              <details key={f.q} className="card group p-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 text-muted transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-24 pt-6">
        <div className="container">
          <div className="relative overflow-hidden rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-600/20 via-surface to-electric-500/10 p-10 text-center sm:p-14">
            <div className="grid-bg pointer-events-none absolute inset-0 opacity-60" />
            <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">Ready to get your first number?</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-muted">Create your free account in seconds. Pay only for what you use.</p>
            <div className="relative mt-8 flex justify-center gap-3">
              <Button asChild size="lg">
                <Link href={user ? "/dashboard/buy" : "/register"}>
                  Get Started <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function SectionTitle({ eyebrow, title, text, align = "center" }: { eyebrow: string; title: string; text?: string; align?: "center" | "left" }) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-muted">{text}</p>}
    </div>
  );
}
