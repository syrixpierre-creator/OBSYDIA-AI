# Stripe configuration

INCONNU SMS uses **Stripe Checkout with dynamic `price_data`** — you do **not** create products or prices in the Stripe catalog.
Amounts come from the platform (wallet top-up amount, or provider cost + admin margin for a direct number purchase).

## 1. API keys
Stripe Dashboard → Developers → API keys.
- `STRIPE_SECRET_KEY=sk_live_…` (or `sk_test_…` to test) in `.env`, **or** Admin → Settings & Stripe → *Set Stripe keys* (super admin, stored AES-256-GCM encrypted).
- The publishable key is optional (Checkout is a hosted page).

## 2. Webhook (mandatory)
Funds are credited **only** by verified webhooks, never by the success redirect.

Stripe Dashboard → Developers → Webhooks → Add endpoint
- URL: `https://YOUR_DOMAIN/api/webhooks/stripe`
- Events:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
  - `checkout.session.expired`
  - `charge.refunded`
- Copy the signing secret `whsec_…` → `STRIPE_WEBHOOK_SECRET` (or the admin form).

Local test:
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
stripe trigger checkout.session.completed   # (metadata won't match a payment; use the UI for an end-to-end test)
```
Test card: `4242 4242 4242 4242`, any future date, any CVC.

## 3. Guarantees
- Signature verified on the raw body (`stripe.webhooks.constructEvent`).
- Event dedup in `inbound_events` (Stripe retries are harmless).
- Payment `PENDING → SUCCEEDED` conditional update + ledger idempotency key `stripe:payment:<id>`: a payment is credited once.
- Amount and currency re-checked against the database.
- Checkout sessions are created with an idempotency key, and an identical open session from the last 10 minutes is reused (no double payment from double clicks).
- Failed / expired sessions are tracked (`FAILED`, `EXPIRED`).
- Card refunds (Admin → Transactions): wallet debited first, Stripe refund with idempotency key, automatic reversal if Stripe refuses.

## 4. Settings (no code change)
Admin → Settings & Stripe: enable/disable card payments, direct card purchase of a number, min/max top-up, preset amounts.
