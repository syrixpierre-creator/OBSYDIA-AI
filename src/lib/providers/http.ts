import { ProviderError } from "./types";

/**
 * HTTP client for provider adapters: timeout, bounded retries with exponential
 * backoff + jitter on network errors / 429 / 5xx. Never retries non-idempotent
 * calls unless `retryUnsafe` is explicitly set by the adapter (e.g. when the
 * provider supports idempotency keys).
 */
export async function providerFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number; retries?: number; retryUnsafe?: boolean } = {},
): Promise<Response> {
  const { timeoutMs = 10_000, retries = 2, retryUnsafe = false, ...rest } = init;
  const method = (rest.method || "GET").toUpperCase();
  const canRetry = retryUnsafe || method === "GET" || method === "HEAD";
  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= (canRetry ? retries : 0)) {
    try {
      const res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
      if ((res.status === 429 || res.status >= 500) && canRetry && attempt < retries) {
        lastErr = new ProviderError("unavailable", `Provider responded ${res.status}`, true);
      } else {
        if (res.status === 401 || res.status === 403) throw new ProviderError("auth", "Provider rejected credentials");
        return res;
      }
    } catch (e) {
      if (e instanceof ProviderError && !e.retryable) throw e;
      lastErr =
        e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")
          ? new ProviderError("timeout", `Provider timeout after ${timeoutMs}ms`, true)
          : e instanceof ProviderError
            ? e
            : new ProviderError("unavailable", `Network error: ${(e as Error).message}`, true);
      if (!canRetry) break;
    }
    attempt++;
    if (attempt <= retries) {
      const delay = Math.min(4000, 300 * 2 ** attempt) + Math.random() * 200;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr instanceof ProviderError ? lastErr : new ProviderError("unknown", String(lastErr));
}
