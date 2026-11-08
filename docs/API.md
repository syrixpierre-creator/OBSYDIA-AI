# INCONNU SMS — Public API v1

Base URL: `https://YOUR_DOMAIN/api/v1` · JSON · amounts in USD (`*_cents` = integer cents).
The same documentation is rendered at `/docs/api`.

## Authentication
`Authorization: Bearer isk_live_…` (or `X-API-Key`). Keys are created/revoked in Dashboard → API Access,
stored hashed (SHA-256) and shown once.

## Rate limiting
Default 60 req/min per key → headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`; `429` when exceeded.
Unauthenticated calls are limited per IP. Anti-abuse: max active orders and orders/hour per account (admin settings).

## Endpoints
| Method | Path | Description |
|---|---|---|
| GET | `/balance` | `{ data: { balance, balance_cents, currency } }` |
| GET | `/countries` | Available countries `{ code, name }` |
| GET | `/services` | Available services `{ code, name }` |
| GET | `/prices?country=FR&service=telegram` | Live price + stock per pair |
| POST | `/orders` | Body `{ "country": "FR", "service": "telegram" }`, header `Idempotency-Key` (recommended). Debits wallet, reserves a number. `201` new / `200` duplicate |
| GET | `/orders?limit=20&cursor=…` | Cursor-paginated list |
| GET | `/orders/:id` | Order + SMS (polls the supplier) |
| GET | `/orders/:id/sms` | Received messages only |
| POST | `/orders/:id/cancel` | Cancel an ACTIVE order without SMS → wallet refund |

### Order object
```json
{
  "id": "cm4…", "status": "RECEIVED", "phone_number": "+33 612 345 678",
  "country": { "code": "FR", "name": "France" }, "service": { "code": "telegram", "name": "Telegram" },
  "price": 1.99, "price_cents": 199, "currency": "USD", "demo": false,
  "expires_at": "2026-01-01T12:20:00.000Z", "created_at": "…", "completed_at": null, "failure_reason": null,
  "sms": [{ "id": "…", "sender": "Telegram", "text": "Your code is 482913", "code": "482913", "received_at": "…" }]
}
```
Statuses: `PENDING`, `ACTIVE`, `RECEIVED`, `COMPLETED`, `CANCELLED`, `EXPIRED`, `FAILED` (the last three are refunded).

## Errors
`{ "error": { "code": "insufficient_funds", "message": "…" } }`

| HTTP | code |
|---|---|
| 400 | `invalid_json` |
| 401 | `unauthorized` |
| 402 | `insufficient_funds` |
| 403 | `account_suspended`, `email_not_verified` |
| 404 | `not_found`, `unknown_country`, `unknown_service` |
| 409 | `out_of_stock`, `provider_error`, `not_cancellable` |
| 422 | `validation_error` |
| 429 | `rate_limited`, `too_many_active_orders`, `hourly_limit` |
| 503 | `maintenance` |

## Webhooks
Events: `order.number_assigned`, `order.sms_received`, `order.cancelled`, `order.expired`, `order.failed`, `wallet.credited`.
Headers: `X-Inconnu-Event`, `X-Inconnu-Signature: t=<unix>,v1=<hex>` with `v1 = HMAC_SHA256(secret, "<t>.<raw body>")`.
Body: `{ "id": "<uuid>", "event": "...", "created": "<iso>", "data": { …order… } }`. Respond 2xx within 5 s.
An endpoint is disabled after 20 consecutive failures.
