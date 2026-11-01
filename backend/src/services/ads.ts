import { env } from "../config/env.js";
import { AdminSetting } from "../models/index.js";
import { logger } from "../lib/logger.js";

export interface AdsSettings {
  enabled: boolean;
  nativeSrc: string;
  nativeContainer: string;
  socialSrc: string;
  smartlink: string;
  socialDelaySeconds: number;
  adFreePlans: string[];
}

export function envAds(): AdsSettings {
  const e = env();
  return {
    enabled: e.ADS_ENABLED,
    nativeSrc: e.ADS_NATIVE_SRC,
    nativeContainer: e.ADS_NATIVE_CONTAINER,
    socialSrc: e.ADS_SOCIAL_SRC,
    smartlink: e.ADS_SMARTLINK,
    socialDelaySeconds: e.ADS_SOCIAL_DELAY_SECONDS,
    adFreePlans: e.ADS_FREE_PLANS.split(",").map((s) => s.trim()).filter(Boolean)
  };
}

let cached: AdsSettings | null = null;
let cachedAt = 0;

export async function getAds(force = false): Promise<AdsSettings> {
  if (!force && cached && Date.now() - cachedAt < 15_000) return cached;
  const base = envAds();
  try {
    const doc = await AdminSetting.findOne({ key: "ads" }).lean<any>();
    cached = { ...base, ...(doc?.value || {}) };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "ads settings unavailable");
    cached = base;
  }
  cachedAt = Date.now();
  return cached!;
}

export function adsActiveSync() {
  const a = cached || envAds();
  return a.enabled && Boolean(a.nativeSrc || a.socialSrc);
}

export function invalidateAds() {
  cached = null;
  cachedAt = 0;
}
