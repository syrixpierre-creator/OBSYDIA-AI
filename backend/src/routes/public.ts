import { Router } from "express";
import { env } from "../config/env.js";
import { getAiSettings, getPlans } from "../services/settings.js";
import { stripeConfigured } from "../services/billing/stripe.js";
import { paypalConfigured } from "../services/billing/paypal.js";
import { transcriptionAvailable } from "../services/transcription.js";
import { mailConfigured } from "../lib/mailer.js";
import { getAds } from "../services/ads.js";

export const publicRouter = Router();

publicRouter.get("/config", async (_req, res) => {
  const e = env();
  const ai = await getAiSettings();
  const plans = await getPlans();
  const ads = await getAds();
  res.setHeader("Cache-Control", "public, max-age=30");
  res.json({
    app: { name: e.APP_NAME, creator: e.APP_CREATOR, email: e.APP_EMAIL, url: e.APP_URL },
    ai: {
      displayName: ai.displayName,
      provider: ai.provider,
      welcomeMessage: ai.welcomeMessage,
      welcomeMessageFr: ai.welcomeMessageFr,
      welcomeSubtitle: ai.welcomeSubtitle,
      suggestions: ai.suggestions,
      model: ai.model, models: ai.models, capabilities: ai.capabilities },
    auth: { google: Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET), emailDelivery: mailConfigured() || e.NODE_ENV !== "production" },
    payments: { stripe: stripeConfigured(), paypal: paypalConfigured(), stripePublishableKey: e.STRIPE_PUBLISHABLE_KEY || null },
    voice: { transcription: await transcriptionAvailable() },
    referral: { required: e.REFERRAL_REQUIRED, rewardTokens: e.REFERRAL_REWARD_TOKENS },
    plans: Object.values(plans).map((p) => ({
      id: p.id,
      priceUsd: p.priceUsd,
      tokenLimit: p.tokenLimit,
      resetHours: p.resetHours,
      apiAccess: p.apiAccess,
      zipUploads: p.zipUploads,
      voiceInput: p.voiceInput,
      advancedProjects: p.advancedProjects,
      priority: p.priority,
      promoEligible: p.promoEligible,
      teams: p.teams,
      maxTeamInvites: p.maxTeamInvites,
      apiRequestsPerMinute: p.apiRequestsPerMinute,
      maxUploadMb: p.maxUploadMb
    })),
    limits: { maxUploadMb: e.MAX_UPLOAD_MB },
    ads: {
      enabled: ads.enabled,
      nativeSrc: ads.nativeSrc || null,
      nativeContainer: ads.nativeContainer || null,
      socialSrc: ads.socialSrc || null,
      smartlink: ads.smartlink || null,
      socialDelaySeconds: ads.socialDelaySeconds,
      adFreePlans: ads.adFreePlans
    }
  });
});
