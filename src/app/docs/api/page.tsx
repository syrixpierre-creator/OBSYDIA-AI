import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "API documentation" };
export const dynamic = "force-dynamic";

const endpoints = [
  { m: "GET", p: "/api/v1/balance", d: "Current wallet balance.", res: `{ "data": { "balance": 12.5, "balance_cents": 1250, "currency": "USD" } }` },
  { m: "GET", p: "/api/v1/countries", d: "Countries currently available.", res: `{ "data": [ { "code": "FR", "name": "France" } ] }` },
  { m: "GET", p: "/api/v1/services", d: "Services currently available.", res: `{ "data": [ { "code": "telegram", "name": "Telegram" } ] }` },
  { m: "GET", p: "/api/v1/prices?country=FR&service=telegram", d: "Live sale prices and availability. Both filters optional.", res: `{ "data": [ { "country": "FR", "service": "telegram", "price": 1.99, "price_cents": 199, "currency": "USD", "available": 1250, "discount_percent": 0, "demo": false } ] }` },
  { m: "POST", p: "/api/v1/orders", d: "Buy a number (debits the wallet). Send an Idempotency-Key header: retries with the same key return the same order and never charge twice.", body: `{ "country": "FR", "service": "telegram" }`, res: `{ "data": { "id": "cm…", "status": "ACTIVE", "phone_number": "+33 6…", "price_cents": 199, "expires_at": "…", "sms": [] }, "duplicate": false }` },
  { m: "GET", p: "/api/v1/orders?limit=20&cursor=…", d: "List your orders (cursor pagination).", res: `{ "data": [ … ], "next_cursor": "cm…" }` },
  { m: "GET", p: "/api/v1/orders/:id", d: "Order details. Polls the supplier for new SMS.", res: `{ "data": { "id": "cm…", "status": "RECEIVED", "sms": [ { "code": "482913", "text": "…" } ] } }` },
  { m: "GET", p: "/api/v1/orders/:id/sms", d: "Only the received messages for an order.", res: `{ "data": { "order_id": "cm…", "status": "RECEIVED", "phone_number": "+33…", "sms": [ … ] } }` },
  { m: "POST", p: "/api/v1/orders/:id/cancel", d: "Cancel an active order with no SMS yet (when the supplier allows it). Refunds the wallet.", res: `{ "data": { "id": "cm…", "status": "CANCELLED" } }` },
];

const errors = [
  ["400", "invalid_json", "Malformed body"],
  ["401", "unauthorized", "Missing, invalid or revoked API key"],
  ["402", "insufficient_funds", "Wallet balance too low"],
  ["403", "account_suspended / email_not_verified", "Account restriction"],
  ["404", "not_found / unknown_country / unknown_service", "Resource not found"],
  ["409", "out_of_stock / provider_error / not_cancellable", "Business rule prevented the action (refunded when applicable)"],
  ["422", "validation_error", "Invalid parameters"],
  ["429", "rate_limited / too_many_active_orders / hourly_limit", "Rate or abuse limits reached"],
  ["503", "maintenance", "Platform temporarily unavailable"],
];

function Code({ children }: { children: string }) {
  return <pre className="scrollbar-thin overflow-x-auto rounded-xl border border-white/[0.07] bg-[#06070A] p-4 font-mono text-[12.5px] leading-relaxed text-foreground/90">{children}</pre>;
}

export default async function ApiDocs() {
  const user = await getCurrentUser();
  const base = env.appUrl;
  return (
    <div>
      <Navbar loggedIn={Boolean(user)} />
      <div className="container grid gap-10 py-12 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-1 text-sm">
            {[["#auth", "Authentication"], ["#limits", "Rate limits"], ["#endpoints", "Endpoints"], ["#errors", "Errors"], ["#webhooks", "Webhooks"], ["#statuses", "Order statuses"]].map(([h, l]) => (
              <a key={h} href={h} className="block rounded-lg px-3 py-1.5 text-muted hover:bg-white/[0.04] hover:text-foreground">{l}</a>
            ))}
          </nav>
        </aside>
        <article className="min-w-0 max-w-3xl space-y-12">
          <header>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Developers</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">INCONNU SMS API v1</h1>
            <p className="mt-3 text-muted">REST API over HTTPS with JSON bodies. Base URL: <code className="font-mono text-violet-200">{base}/api/v1</code>. Amounts are in USD; <code className="font-mono">*_cents</code> fields are integers.</p>
          </header>

          <section id="auth" className="scroll-mt-24">
            <h2 className="text-xl font-semibold">Authentication</h2>
            <p className="mt-2 text-sm text-muted">Create a key in <Link href="/dashboard/api" className="text-violet-300 hover:underline">Dashboard → API Access</Link>. Keys start with <code className="font-mono">isk_live_</code>, are stored hashed (SHA-256) and shown only once. Keep them server-side.</p>
            <div className="mt-4"><Code>{`curl ${base}/api/v1/balance \\\n  -H "Authorization: Bearer isk_live_xxxxxxxxxxxxxxxx"`}</Code></div>
          </section>

          <section id="limits" className="scroll-mt-24">
            <h2 className="text-xl font-semibold">Rate limits</h2>
            <p className="mt-2 text-sm text-muted">Each key allows 60 requests/minute by default. Responses include <code className="font-mono">X-RateLimit-Limit</code>, <code className="font-mono">X-RateLimit-Remaining</code> and <code className="font-mono">X-RateLimit-Reset</code>. Exceeding returns <code className="font-mono">429</code>. Anti-abuse limits also cap active orders and orders per hour.</p>
          </section>

          <section id="endpoints" className="scroll-mt-24 space-y-6">
            <h2 className="text-xl font-semibold">Endpoints</h2>
            {endpoints.map((e) => (
              <div key={e.m + e.p} className="card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={e.m === "GET" ? "blue" : "green"}>{e.m}</Badge>
                  <code className="break-all font-mono text-sm">{e.p}</code>
                </div>
                <p className="mt-2 text-sm text-muted">{e.d}</p>
                {e.body && <><p className="mt-4 text-xs font-medium uppercase tracking-wider text-muted">Body</p><div className="mt-2"><Code>{e.body}</Code></div></>}
                <p className="mt-4 text-xs font-medium uppercase tracking-wider text-muted">Response</p>
                <div className="mt-2"><Code>{e.res}</Code></div>
              </div>
            ))}
            <div>
              <p className="text-sm font-medium">Example — buy a number</p>
              <div className="mt-2">
                <Code>{`curl -X POST ${base}/api/v1/orders \\\n  -H "Authorization: Bearer $INCONNU_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -H "Idempotency-Key: 5d1c6c1e-2b8f-4c7e-9d0a-1f2e3d4c5b6a" \\\n  -d '{"country":"FR","service":"telegram"}'`}</Code>
              </div>
            </div>
          </section>

          <section id="errors" className="scroll-mt-24">
            <h2 className="text-xl font-semibold">Errors</h2>
            <p className="mt-2 text-sm text-muted">Errors share one format:</p>
            <div className="mt-3"><Code>{`{ "error": { "code": "insufficient_funds", "message": "Insufficient wallet balance. Please add funds." } }`}</Code></div>
            <div className="card mt-4 overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {errors.map(([s, c, d]) => (
                    <tr key={c} className="border-b border-white/[0.05] last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs">{s}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-violet-200">{c}</td>
                      <td className="px-4 py-2.5 text-muted">{d}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="webhooks" className="scroll-mt-24">
            <h2 className="text-xl font-semibold">Webhooks</h2>
            <p className="mt-2 text-sm text-muted">
              Add endpoints in API Access. Events: <code className="font-mono">order.number_assigned</code>, <code className="font-mono">order.sms_received</code>, <code className="font-mono">order.cancelled</code>, <code className="font-mono">order.expired</code>, <code className="font-mono">order.failed</code>, <code className="font-mono">wallet.credited</code>.
              Each request carries <code className="font-mono">X-Inconnu-Event</code> and <code className="font-mono">X-Inconnu-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</code> where <code className="font-mono">v1 = HMAC_SHA256(secret, t + &quot;.&quot; + rawBody)</code>. Reject requests older than 5 minutes. Endpoints are disabled after 20 consecutive failures.
            </p>
            <div className="mt-4">
              <Code>{`// Node.js verification
import crypto from "crypto";
function verify(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}`}</Code>
            </div>
          </section>

          <section id="statuses" className="scroll-mt-24">
            <h2 className="text-xl font-semibold">Order statuses</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-muted">
              <li><code className="font-mono text-foreground">PENDING</code> — wallet debited, waiting for supplier confirmation</li>
              <li><code className="font-mono text-foreground">ACTIVE</code> — number assigned, waiting for SMS</li>
              <li><code className="font-mono text-foreground">RECEIVED</code> — at least one SMS received</li>
              <li><code className="font-mono text-foreground">COMPLETED</code> — finished</li>
              <li><code className="font-mono text-foreground">CANCELLED</code> / <code className="font-mono text-foreground">EXPIRED</code> / <code className="font-mono text-foreground">FAILED</code> — closed and refunded to the wallet</li>
            </ul>
          </section>
        </article>
      </div>
      <Footer />
    </div>
  );
}
