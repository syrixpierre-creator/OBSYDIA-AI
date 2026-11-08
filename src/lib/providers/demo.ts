import { createHash, randomInt } from "crypto";
import { ProviderError, extractCode, type AdapterFactory, type ProviderAdapter, type ProviderSms } from "./types";

/**
 * DEMO adapter — clearly identified simulation, NO real numbers, NO real money.
 * Lets you test the full flow (catalog sync, purchase, SMS reception, cancel,
 * expiry, refunds) before connecting a real supplier.
 *
 * Numbers use reserved fictional ranges and every message is tagged "[DEMO]".
 */

const COUNTRIES: [string, string, string][] = [
  ["US", "United States", "1"], ["GB", "United Kingdom", "44"], ["FR", "France", "33"], ["DE", "Germany", "49"],
  ["CA", "Canada", "1"], ["ES", "Spain", "34"], ["IT", "Italy", "39"], ["NL", "Netherlands", "31"],
  ["BE", "Belgium", "32"], ["CH", "Switzerland", "41"], ["PT", "Portugal", "351"], ["SE", "Sweden", "46"],
  ["PL", "Poland", "48"], ["BR", "Brazil", "55"], ["MX", "Mexico", "52"], ["AR", "Argentina", "54"],
  ["IN", "India", "91"], ["ID", "Indonesia", "62"], ["PH", "Philippines", "63"], ["VN", "Vietnam", "84"],
  ["TH", "Thailand", "66"], ["MY", "Malaysia", "60"], ["NG", "Nigeria", "234"], ["CI", "Côte d'Ivoire", "225"],
  ["SN", "Senegal", "221"], ["CM", "Cameroon", "237"], ["MA", "Morocco", "212"], ["ZA", "South Africa", "27"],
  ["KE", "Kenya", "254"], ["EG", "Egypt", "20"], ["TR", "Türkiye", "90"], ["AE", "United Arab Emirates", "971"],
  ["JP", "Japan", "81"], ["KR", "South Korea", "82"], ["AU", "Australia", "61"], ["UA", "Ukraine", "380"],
];

const SERVICES: [string, string][] = [
  ["telegram", "Telegram"], ["whatsapp", "WhatsApp"], ["google", "Google / Gmail"], ["facebook", "Facebook"],
  ["instagram", "Instagram"], ["tiktok", "TikTok"], ["twitter", "X (Twitter)"], ["discord", "Discord"],
  ["microsoft", "Microsoft"], ["apple", "Apple"], ["amazon", "Amazon"], ["uber", "Uber"],
  ["airbnb", "Airbnb"], ["paypal", "PayPal"], ["linkedin", "LinkedIn"], ["snapchat", "Snapchat"],
  ["signal", "Signal"], ["viber", "Viber"], ["openai", "OpenAI"], ["netflix", "Netflix"],
  ["tinder", "Tinder"], ["yahoo", "Yahoo"], ["steam", "Steam"], ["other", "Any other service"],
];

const SMS_DELAY_SECONDS = 20;
const LIFETIME_MINUTES = 20;

function h(s: string) {
  return parseInt(createHash("sha1").update(s).digest("hex").slice(0, 8), 16);
}

function costFor(country: string, service: string) {
  // deterministic 8¢ – 160¢
  return 8 + (h(`${country}:${service}:cost`) % 153);
}

function stockFor(country: string, service: string) {
  const hourSeed = Math.floor(Date.now() / 3_600_000);
  const v = h(`${country}:${service}:${hourSeed}`) % 1000;
  return v < 80 ? 0 : v * 7; // ~8% of offerings out of stock
}

function parseId(id: string) {
  // demo_<country>_<service>_<createdMs>_<rand>[_c]
  const [prefix, country, service, ts, rand, cancelled] = id.split("_");
  if (prefix !== "demo" || !country || !service || !ts || !rand) throw new ProviderError("bad_request", "Unknown demo order");
  return { country, service, createdAt: Number(ts), rand, cancelled: cancelled === "c" };
}

// In-memory cancellation registry (demo only)
const cancelled = new Set<string>();

export const createDemoAdapter: AdapterFactory = (): ProviderAdapter => ({
  key: "demo",
  displayName: "DEMO Provider (simulation)",
  isDemo: true,
  capabilities: { cancel: true, finish: true, webhooks: false },

  async getBalance() {
    return { amountCents: 1_000_000, currency: "USD" };
  },
  async getCountries() {
    return COUNTRIES.map(([iso2, name]) => ({ providerCode: iso2.toLowerCase(), iso2, name }));
  },
  async getServices() {
    return SERVICES.map(([slug, name]) => ({ providerCode: slug, slug, name }));
  },
  async getPrices() {
    const out = [];
    for (const [iso2] of COUNTRIES)
      for (const [slug] of SERVICES)
        out.push({ countryCode: iso2.toLowerCase(), serviceCode: slug, costCents: costFor(iso2, slug), available: stockFor(iso2, slug) });
    return out;
  },
  async getAvailability(countryCode, serviceCode) {
    const cc = countryCode.toUpperCase();
    return { available: stockFor(cc, serviceCode), costCents: costFor(cc, serviceCode) };
  },
  async requestNumber({ countryCode, serviceCode, maxCostCents }) {
    const cc = countryCode.toUpperCase();
    const country = COUNTRIES.find((c) => c[0] === cc);
    if (!country || !SERVICES.some((s) => s[0] === serviceCode)) throw new ProviderError("bad_request", "Unknown country/service");
    if (stockFor(cc, serviceCode) === 0) throw new ProviderError("no_numbers", "No numbers available for this selection");
    const cost = costFor(cc, serviceCode);
    if (cost > maxCostCents) throw new ProviderError("price_changed", "Provider price increased");
    await new Promise((r) => setTimeout(r, 300)); // simulate latency
    const local = String(randomInt(100_000_000, 999_999_999));
    const now = Date.now();
    return {
      providerOrderId: `demo_${cc.toLowerCase()}_${serviceCode}_${now}_${randomInt(1e6, 9e6)}`,
      phoneNumber: `+${country[2]} ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`,
      costCents: cost,
      expiresAt: new Date(now + LIFETIME_MINUTES * 60_000),
    };
  },
  async getSMS(providerOrderId) {
    const o = parseId(providerOrderId);
    if (cancelled.has(providerOrderId)) return { status: "cancelled", messages: [] };
    const age = (Date.now() - o.createdAt) / 1000;
    const expired = age > LIFETIME_MINUTES * 60;
    const messages: ProviderSms[] = [];
    if (age >= SMS_DELAY_SECONDS) {
      const code = String(100000 + (h(providerOrderId) % 900000));
      const svc = SERVICES.find((s) => s[0] === o.service)?.[1] ?? o.service;
      const text = `[DEMO] Your ${svc} verification code is ${code}. Simulated message — no real SMS was sent.`;
      messages.push({
        id: `${providerOrderId}:1`,
        sender: svc,
        text,
        code: extractCode(text),
        receivedAt: new Date(o.createdAt + SMS_DELAY_SECONDS * 1000),
      });
    }
    return { status: messages.length ? "received" : expired ? "expired" : "waiting", messages };
  },
  async cancelNumber(providerOrderId) {
    const o = parseId(providerOrderId);
    if ((Date.now() - o.createdAt) / 1000 >= SMS_DELAY_SECONDS) return { cancelled: false };
    cancelled.add(providerOrderId);
    return { cancelled: true };
  },
  async finishNumber() {},
});
