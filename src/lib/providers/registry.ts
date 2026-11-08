import type { Provider } from "@prisma/client";
import { decrypt } from "../crypto";
import { createDemoAdapter } from "./demo";
import type { AdapterFactory, ProviderAdapter } from "./types";

/**
 * Adapter registry. To add a real supplier:
 *   1. implement `ProviderAdapter` in src/lib/providers/<name>.ts using the
 *      supplier's OFFICIAL API documentation (use `providerFetch` for timeouts/retries),
 *   2. register its factory below,
 *   3. create the provider in Admin → Providers (adapter = key) and set its API key
 *      via env `PROVIDER_<CODE>_API_KEY` or the encrypted admin field.
 * See docs/PROVIDERS.md.
 */
export const ADAPTERS: Record<string, { factory: AdapterFactory; label: string; isDemo: boolean }> = {
  demo: { factory: createDemoAdapter, label: "DEMO (simulation, no real numbers)", isDemo: true },
};

export function providerApiKey(p: Pick<Provider, "code" | "apiKeyEncrypted">): string | null {
  const envKey = process.env[`PROVIDER_${p.code.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`];
  if (envKey) return envKey;
  if (p.apiKeyEncrypted) {
    try {
      return decrypt(p.apiKeyEncrypted);
    } catch {
      return null;
    }
  }
  return null;
}

export function getAdapter(p: Provider): ProviderAdapter {
  const entry = ADAPTERS[p.adapter];
  if (!entry) throw new Error(`No adapter registered for "${p.adapter}"`);
  return entry.factory({ apiKey: providerApiKey(p), config: (p.config as Record<string, unknown>) ?? {} });
}
