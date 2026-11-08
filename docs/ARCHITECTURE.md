# Architecture — INCONNU SMS

```
                    ┌────────────── Nginx (TLS, rate limit, gzip) ──────────────┐
 Browser / API ───▶ │                                                           │
                    └──────────────────────────┬────────────────────────────────┘
                                               ▼
                    ┌──────────── Next.js 15 app (Node, TypeScript) ────────────┐
                    │  App Router pages (RSC)    Route handlers /api/*           │
                    │  ├ landing / services      ├ auth, orders, payments        │
                    │  ├ /dashboard (user)       ├ /api/v1/* public API (keys)   │
                    │  └ /admin                  ├ /api/webhooks/stripe          │
                    │                            └ /api/cron/sync (worker only)  │
                    │  Domain layer (src/lib)                                    │
                    │  ├ orders.ts   purchase / SMS polling / expiry / refunds   │
                    │  ├ wallet.ts   atomic ledger (idempotency keys)            │
                    │  ├ pricing.ts  cost + margin rules + promotions            │
                    │  ├ catalog.ts  provider sync (countries/services/prices)   │
                    │  ├ stripe.ts   Checkout price_data + webhook fulfilment    │
                    │  └ providers/  adapter interface + registry + DEMO         │
                    └───────┬──────────────────┬──────────────────┬──────────────┘
                            ▼                  ▼                  ▼
                       PostgreSQL           Redis            Providers APIs / Stripe
                       (Prisma)        (rate limiting)

   Worker container ── every 10 s ──▶ POST /api/cron/sync?task=orders
                     ── every 10 min ▶ POST /api/cron/sync?task=catalog
                     ── every hour ──▶ POST /api/cron/sync?task=cleanup
```

## Key flows

**Purchase** (`src/lib/orders.ts → createOrder`)
1. Anti-abuse checks (suspended, maintenance, verified email, active orders, hourly limit).
2. Idempotency: `orders.idempotencyKey` is UNIQUE — the same key returns the same order.
3. One DB transaction: create `PENDING` order + debit wallet (`order:debit:<id>` ledger key, conditional `balance >= price` update, DB CHECK `balance >= 0`).
4. `adapter.requestNumber()` with a maximum cost (margin protection).
5. Success → `ACTIVE` with number. Failure → `FAILED` + automatic wallet refund (`order:refund:<id>`).
   A number is never shown before the supplier confirms it.

**SMS / expiry** (`refreshOrder`) — polled by the UI (every 4 s), the public API and the worker. New messages are inserted with `skipDuplicates` (unique `orderId+providerSmsId`). No SMS at expiry → `EXPIRED` + refund. Status transitions use conditional updates so concurrent pollers never refund twice.

**Payments** (`src/lib/stripe.ts`) — Checkout Session with `price_data` (dynamic amount, no catalog). The success page never credits anything: only `checkout.session.completed` / `async_payment_succeeded` webhooks with a verified signature do, once (`inbound_events` dedup + `PENDING→SUCCEEDED` conditional update + `stripe:payment:<id>` ledger key). Amount and currency are re-checked against the DB.

**Refunds** — automatic (failed/expired/cancelled orders → wallet), manual order refund (admin, once per order), card refund via Stripe (wallet debited first, reversed if Stripe fails).

## Security summary
- Passwords: bcrypt (cost 12). Sessions: random 256-bit token, only its SHA-256 stored, httpOnly + SameSite=Lax + Secure (https).
- CSRF: Origin/Referer must match the host on every cookie-authenticated mutation.
- Rate limiting: Redis (or memory) per IP / user / API key + Nginx `limit_req`.
- Validation: zod on every input; Prisma parameterised queries (no SQL injection); React escaping + CSP headers (XSS).
- Secrets: env only, or AES-256-GCM encrypted in DB; masked in the UI; never sent to the browser.
- API keys stored hashed, shown once; outgoing webhooks HMAC-signed, SSRF-filtered URLs.
- Audit log for sensitive actions; system log for provider/payment events.
