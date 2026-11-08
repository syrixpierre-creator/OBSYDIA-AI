import type { Prisma } from "@prisma/client";
import { db } from "./db";

export type GeneralSettings = {
  siteName: string;
  supportEmail: string;
  maintenanceMode: boolean;
  registrationOpen: boolean;
  requireVerifiedEmailToPurchase: boolean;
  announcement: string;
};

export type PricingSettings = {
  defaultMarginPercent: number;
  defaultMarginFixedCents: number;
  minPriceCents: number;
  rounding: "none" | "x99";
};

export type PaymentSettings = {
  enabled: boolean;
  currency: string;
  minTopupCents: number;
  maxTopupCents: number;
  presetAmountsCents: number[];
  allowDirectCardPurchase: boolean;
  publishableKey: string;
  secretKeyEncrypted: string | null;
  webhookSecretEncrypted: string | null;
};

export type OrderSettings = {
  defaultExpiryMinutes: number;
  maxActiveOrdersPerUser: number;
  maxOrdersPerHour: number;
  autoRefundOnExpiry: boolean;
};

export const DEFAULT_SETTINGS: { general: GeneralSettings; pricing: PricingSettings; payments: PaymentSettings; orders: OrderSettings } = {
  general: {
    siteName: "INCONNU SMS",
    supportEmail: "support@example.com",
    maintenanceMode: false,
    registrationOpen: true,
    requireVerifiedEmailToPurchase: false,
    announcement: "",
  },
  pricing: {
    defaultMarginPercent: 100,
    defaultMarginFixedCents: 0,
    minPriceCents: 50,
    rounding: "x99",
  },
  payments: {
    enabled: true,
    currency: "usd",
    minTopupCents: 500,
    maxTopupCents: 50000,
    presetAmountsCents: [500, 1000, 2500, 5000, 10000],
    allowDirectCardPurchase: true,
    publishableKey: "",
    secretKeyEncrypted: null,
    webhookSecretEncrypted: null,
  },
  orders: {
    defaultExpiryMinutes: 20,
    maxActiveOrdersPerUser: 10,
    maxOrdersPerHour: 30,
    autoRefundOnExpiry: true,
  },
};

export type SettingsMap = typeof DEFAULT_SETTINGS;
export type SettingKey = keyof SettingsMap;

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingsMap[K]> {
  const row = await db.setting.findUnique({ where: { key } });
  return { ...DEFAULT_SETTINGS[key], ...((row?.value as object) ?? {}) } as SettingsMap[K];
}

export async function setSetting<K extends SettingKey>(key: K, value: Partial<SettingsMap[K]>) {
  const current = await getSetting(key);
  const merged = { ...current, ...value } as unknown as Prisma.InputJsonValue;
  await db.setting.upsert({ where: { key }, create: { key, value: merged }, update: { value: merged } });
  return merged as unknown as SettingsMap[K];
}
