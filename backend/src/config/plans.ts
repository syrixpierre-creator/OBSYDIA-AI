import { env } from "./env.js";

export type PlanId = "free" | "pro" | "premium" | "custom";

export interface PlanDefinition {
  id: PlanId;
  priceUsd: number;
  tokenLimit: number;
  resetHours: number;
  apiAccess: boolean;
  zipUploads: boolean;
  voiceInput: boolean;
  pinning: boolean;
  advancedProjects: boolean;
  priority: boolean;
  promoEligible: boolean;
  teams: boolean;
  maxTeamInvites: number;
  apiRequestsPerMinute: number;
  maxUploadMb: number;
}

export interface PlanOverrides {
  [plan: string]: { tokenLimit?: number; resetHours?: number; priceUsd?: number } | undefined;
}

export function basePlans(): Record<PlanId, PlanDefinition> {
  const e = env();
  return {
    free: {
      id: "free",
      priceUsd: 0,
      tokenLimit: e.FREE_TOKEN_LIMIT,
      resetHours: e.FREE_TOKEN_RESET_HOURS,
      apiAccess: false,
      zipUploads: false,
      voiceInput: false,
      pinning: true,
      advancedProjects: false,
      priority: false,
      promoEligible: false,
      teams: false,
      maxTeamInvites: 0,
      apiRequestsPerMinute: 0,
      maxUploadMb: Math.min(10, e.MAX_UPLOAD_MB)
    },
    pro: {
      id: "pro",
      priceUsd: Number(e.PRO_PRICE_USD),
      tokenLimit: e.PRO_TOKEN_LIMIT,
      resetHours: e.PRO_TOKEN_RESET_HOURS,
      apiAccess: true,
      zipUploads: true,
      voiceInput: true,
      pinning: true,
      advancedProjects: true,
      priority: true,
      promoEligible: true,
      teams: false,
      maxTeamInvites: 0,
      apiRequestsPerMinute: 30,
      maxUploadMb: e.MAX_UPLOAD_MB
    },
    premium: {
      id: "premium",
      priceUsd: Number(e.PREMIUM_PRICE_USD),
      tokenLimit: e.PREMIUM_TOKEN_LIMIT,
      resetHours: e.PREMIUM_TOKEN_RESET_HOURS,
      apiAccess: true,
      zipUploads: true,
      voiceInput: true,
      pinning: true,
      advancedProjects: true,
      priority: true,
      promoEligible: true,
      teams: true,
      maxTeamInvites: e.MAX_TEAM_INVITES,
      apiRequestsPerMinute: 120,
      maxUploadMb: e.MAX_UPLOAD_MB
    },
    custom: {
      id: "custom",
      priceUsd: 0,
      tokenLimit: e.PREMIUM_TOKEN_LIMIT * 4,
      resetHours: e.PREMIUM_TOKEN_RESET_HOURS,
      apiAccess: true,
      zipUploads: true,
      voiceInput: true,
      pinning: true,
      advancedProjects: true,
      priority: true,
      promoEligible: true,
      teams: true,
      maxTeamInvites: e.MAX_TEAM_INVITES,
      apiRequestsPerMinute: 600,
      maxUploadMb: e.MAX_UPLOAD_MB
    }
  };
}

export function applyOverrides(plans: Record<PlanId, PlanDefinition>, overrides: PlanOverrides | undefined) {
  if (!overrides) return plans;
  const out = { ...plans };
  for (const id of Object.keys(out) as PlanId[]) {
    const o = overrides[id];
    if (!o) continue;
    out[id] = {
      ...out[id],
      tokenLimit: o.tokenLimit ?? out[id].tokenLimit,
      resetHours: o.resetHours ?? out[id].resetHours,
      priceUsd: o.priceUsd ?? out[id].priceUsd
    };
  }
  return out;
}

export const PAID_PLANS: PlanId[] = ["pro", "premium"];
