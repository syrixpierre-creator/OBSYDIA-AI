import { env } from "../../config/env.js";
import { Payment, Subscription, User } from "../../models/index.js";
import { sendEmail } from "../../lib/mailer.js";
import { applyPlanToBalance } from "../tokens.js";
import { logger } from "../../lib/logger.js";

const GRACE_MS = 3 * 86400_000;

export async function activateSubscription(input: {
  userId: unknown;
  plan: "pro" | "premium";
  provider: "stripe" | "paypal";
  providerSubscriptionId: string;
  currentPeriodEnd: Date | null;
  promoCodeId?: unknown;
}) {
  const before = await Subscription.findOne({ provider: input.provider, providerSubscriptionId: input.providerSubscriptionId }).lean<any>();
  await Subscription.updateOne(
    { provider: input.provider, providerSubscriptionId: input.providerSubscriptionId },
    {
      $set: { userId: input.userId, plan: input.plan, status: "active", currentPeriodEnd: input.currentPeriodEnd, cancelAtPeriodEnd: false },
      $setOnInsert: { promoCodeId: input.promoCodeId ?? null }
    },
    { upsert: true }
  );
  const user = await User.findById(input.userId);
  if (!user) return;
  const changed = user.plan !== input.plan;
  user.plan = input.plan;
  user.planExpiresAt = input.currentPeriodEnd ? new Date(input.currentPeriodEnd.getTime() + GRACE_MS) : null;
  await user.save();
  await applyPlanToBalance(user._id, input.plan, changed);
  if (!before || before.status !== "active") {
    void sendEmail(user.email, "subscription_activated", user.locale, { plan: input.plan.toUpperCase(), url: `${env().APP_URL}/app/billing` });
  }
}

export async function updateSubscriptionStatus(
  provider: "stripe" | "paypal",
  providerSubscriptionId: string,
  status: "active" | "past_due" | "canceled" | "expired",
  extra: { currentPeriodEnd?: Date | null; cancelAtPeriodEnd?: boolean } = {}
) {
  const sub = await Subscription.findOneAndUpdate(
    { provider, providerSubscriptionId },
    {
      $set: {
        status,
        ...(extra.currentPeriodEnd !== undefined ? { currentPeriodEnd: extra.currentPeriodEnd } : {}),
        ...(extra.cancelAtPeriodEnd !== undefined ? { cancelAtPeriodEnd: extra.cancelAtPeriodEnd } : {}),
        ...(status === "canceled" ? { canceledAt: new Date() } : {})
      }
    },
    { new: true }
  ).lean<any>();
  if (!sub) return null;
  const user = await User.findById(sub.userId);
  if (!user) return sub;
  if (status === "canceled" || status === "expired") {
    const other = await Subscription.findOne({ userId: user._id, status: "active", _id: { $ne: sub._id } }).lean<any>();
    if (!other) {
      user.plan = "free";
      user.planExpiresAt = null;
      await user.save();
      await applyPlanToBalance(user._id, "free", true);
    }
    void sendEmail(user.email, "subscription_canceled", user.locale, {
      plan: sub.plan.toUpperCase(),
      detail: user.locale === "fr" ? "Votre compte est revenu à l'offre Free." : "Your account has returned to the Free plan.",
      url: `${env().APP_URL}/pricing`
    });
  } else if (status === "past_due") {
    void sendEmail(user.email, "payment_failed", user.locale, { plan: sub.plan.toUpperCase(), url: `${env().APP_URL}/app/billing` });
  } else if (status === "active" && extra.currentPeriodEnd) {
    user.planExpiresAt = new Date(extra.currentPeriodEnd.getTime() + GRACE_MS);
    await user.save();
  }
  return sub;
}

export async function recordPayment(input: {
  userId: unknown;
  provider: "stripe" | "paypal";
  providerPaymentId: string;
  amountCents: number;
  currency: string;
  status: "succeeded" | "failed" | "refunded" | "partially_refunded" | "pending";
  plan?: string | null;
  description?: string;
  subscriptionRef?: string | null;
}) {
  const sub = input.subscriptionRef
    ? await Subscription.findOne({ provider: input.provider, providerSubscriptionId: input.subscriptionRef }).lean<any>()
    : null;
  const before = await Payment.findOne({ provider: input.provider, providerPaymentId: input.providerPaymentId }).lean<any>();
  await Payment.updateOne(
    { provider: input.provider, providerPaymentId: input.providerPaymentId },
    {
      $set: { status: input.status, amountCents: input.amountCents, currency: input.currency },
      $setOnInsert: { userId: input.userId, plan: input.plan ?? sub?.plan ?? null, description: input.description ?? "", subscriptionId: sub?._id ?? null }
    },
    { upsert: true }
  );
  if (input.status === "succeeded" && (!before || before.status !== "succeeded")) {
    const user = await User.findById(input.userId).lean<any>();
    if (user) {
      void sendEmail(user.email, "payment_succeeded", user.locale, {
        amount: `$${(input.amountCents / 100).toFixed(2)}`,
        plan: String(input.plan ?? sub?.plan ?? "").toUpperCase(),
        url: `${env().APP_URL}/app/billing`
      });
    }
  }
}

export async function expireLapsedPlans() {
  const lapsed = await User.find({ plan: { $in: ["pro", "premium"] }, planExpiresAt: { $ne: null, $lt: new Date() } }).limit(200);
  for (const user of lapsed) {
    const active = await Subscription.findOne({ userId: user._id, status: "active", currentPeriodEnd: { $gt: new Date() } }).lean<any>();
    if (active) continue;
    user.plan = "free";
    user.planExpiresAt = null;
    await user.save();
    await applyPlanToBalance(user._id, "free", true);
    logger.info({ userId: String(user._id) }, "plan expired; downgraded to free");
  }
}
