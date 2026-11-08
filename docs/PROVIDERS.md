# Provider integration

INCONNU SMS never hard-codes a supplier. Every supplier is an **adapter** implementing
`ProviderAdapter` (`src/lib/providers/types.ts`):

| Method | Purpose |
|---|---|
| `getBalance()` | Supplier account balance (shown in Admin → Providers) |
| `getCountries()` | Supplier countries → mapped to ISO-3166 alpha-2 |
| `getServices()` | Supplier services → normalized slug (`telegram`, `whatsapp`…) |
| `getPrices()` | Cost + stock for each country/service pair |
| `getAvailability(country, service)` | Live stock/cost for one pair |
| `requestNumber({countryCode, serviceCode, maxCostCents, reference})` | Reserve a number |
| `getSMS(providerOrderId)` | Status + received messages |
| `cancelNumber(providerOrderId)` | Release a number (when allowed) |
| `finishNumber?(providerOrderId)` | Optional: mark as done |

Errors must be thrown as `ProviderError(code, message, retryable)` with codes
`no_numbers`, `price_changed`, `provider_balance`, `timeout`, `unavailable`, `auth`, `bad_request`…
so the platform can refund and show a clear message.

## Adding a real supplier

> Use the supplier's **official API documentation**. Do not guess endpoints.

1. Create `src/lib/providers/<name>.ts`:
   ```ts
   import { providerFetch } from "./http";          // timeout + retry + backoff
   import { ProviderError, extractCode, type AdapterFactory } from "./types";

   export const createMySupplierAdapter: AdapterFactory = ({ apiKey, config }) => {
     if (!apiKey) throw new ProviderError("auth", "API key missing");
     const base = (config.baseUrl as string) ?? "https://api.supplier.example";
     return {
       key: "mysupplier", displayName: "My Supplier", isDemo: false,
       capabilities: { cancel: true, finish: true, webhooks: false },
       async getBalance() { const r = await providerFetch(`${base}/…`, { headers: { Authorization: `Bearer ${apiKey}` } }); … },
       // … implement every method from the docs
     };
   };
   ```
   `providerFetch` only retries GET/HEAD by default — purchase calls are never retried
   automatically unless the supplier supports idempotency (`retryUnsafe: true`).
2. Register it in `src/lib/providers/registry.ts`:
   ```ts
   mysupplier: { factory: createMySupplierAdapter, label: "My Supplier", isDemo: false },
   ```
3. Set the key: `PROVIDER_MYSUPPLIER_API_KEY=…` in `.env` (preferred) or in Admin → API Providers (stored encrypted).
4. Admin → API Providers → **Add provider** (adapter `mysupplier`, code `mysupplier`) → **Test connection** → **Sync catalog**.
5. Disable the DEMO provider when you go live.

Multiple providers can run side by side: for each country/service the cheapest in-stock offer wins,
then the lowest `priority`. Catalog is re-synced every 10 minutes by the worker.

## DEMO provider
`src/lib/providers/demo.ts` — clearly labelled simulation: 36 countries, 24 services, deterministic costs,
an SMS tagged `[DEMO]` arrives ~20 s after purchase, cancellation possible before that. No real number
or SMS is involved. It is flagged everywhere in the UI ("DEMO mode" banners and badges).
