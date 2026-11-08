/**
 * Provider-agnostic contract. Every virtual-number supplier is wrapped in an adapter
 * implementing this interface so the platform can switch / combine providers
 * without touching business logic.
 */

export type ProviderCountry = {
  providerCode: string; // provider's own identifier
  iso2: string; // ISO-3166 alpha-2, upper case
  name: string;
};

export type ProviderServiceItem = {
  providerCode: string;
  slug: string; // normalized platform slug, e.g. "telegram"
  name: string;
};

export type ProviderPrice = {
  countryCode: string; // provider country code
  serviceCode: string; // provider service code
  costCents: number;
  available: number;
};

export type RequestedNumber = {
  providerOrderId: string;
  phoneNumber: string;
  costCents: number;
  expiresAt: Date;
};

export type ProviderSms = {
  id: string;
  sender: string | null;
  text: string;
  code: string | null;
  receivedAt: Date;
};

export type SmsStatus = "waiting" | "received" | "cancelled" | "expired" | "finished";

export type ProviderErrorCode =
  | "no_numbers"
  | "price_changed"
  | "provider_balance"
  | "timeout"
  | "unavailable"
  | "auth"
  | "bad_request"
  | "not_supported"
  | "unknown";

export class ProviderError extends Error {
  constructor(
    public code: ProviderErrorCode,
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}

export interface ProviderAdapter {
  readonly key: string;
  readonly displayName: string;
  readonly isDemo: boolean;
  readonly capabilities: { cancel: boolean; finish: boolean; webhooks: boolean };

  getBalance(): Promise<{ amountCents: number; currency: string }>;
  getCountries(): Promise<ProviderCountry[]>;
  getServices(): Promise<ProviderServiceItem[]>;
  getPrices(): Promise<ProviderPrice[]>;
  getAvailability(countryCode: string, serviceCode: string): Promise<{ available: number; costCents: number }>;
  requestNumber(p: {
    countryCode: string;
    serviceCode: string;
    maxCostCents: number;
    reference: string;
  }): Promise<RequestedNumber>;
  getSMS(providerOrderId: string): Promise<{ status: SmsStatus; messages: ProviderSms[] }>;
  cancelNumber(providerOrderId: string): Promise<{ cancelled: boolean }>;
  finishNumber?(providerOrderId: string): Promise<void>;
}

export type AdapterFactory = (opts: { apiKey: string | null; config: Record<string, unknown> }) => ProviderAdapter;

/** Extracts a 4-8 digit verification code from an SMS body. */
export function extractCode(text: string): string | null {
  const m = text.match(/(?<!\d)(\d{3}[- ]?\d{3}|\d{4,8})(?!\d)/);
  return m ? m[1]!.replace(/[- ]/g, "") : null;
}
