import Stripe from "stripe";
import { env } from "../../config/env.js";
import { AppError, unavailable } from "../../lib/errors.js";
import { User, Subscription, WebhookEvent } from "../../models/index.js";
import { getPlan } from "../settings.js";
import { evaluatePromo, redeemPromo, reservePromo } from "./promo.js";
import { activateSubscription, recordPayment, updateSubscriptionStatus } from "./subscriptions.js";
import { logger } from "../../lib/logger.js";

let client: Stripe | null = null;

export function stripeConfigured() {
  return Boolean(env().STRIPE_SECRET_KEY);
}

export function stripe() {
  if (!stripeConfigured()) throw unavailable("stripe_not_configured", "Stripe is not configured");
  client ??= new Stripe(env().STRIPE_SECRET_KEY);
  return client;
}

export function setStripeClient(c: Stripe | null) {
  client = c;
}

export async function createStripeCheckout(user: any, planId: "pro" | "premium", promoCode?: string) {
  const plan = await getPlan(planId);
  const priceCents = Math.round(plan.priceUsd * 100);
  const promo = await evaluatePromo(promoCode, planId, priceCents);
  const s = stripe();
  let customer = user.stripeCustomerId as string | null;
  if (!customer) {
    const c = await s.customers.create({ email: user.email, name: user.name, metadata: { userId: String(user._id) } });
    customer = c.id;
    await User.updateOne({ _id: user._id }, { $set: { stripeCustomerId: customer } });
  }
  let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined;
  if (promo && promo.discountCents > 0) {
    const coupon = await s.coupons.create({
      duration: "once",
      ...(promo.promo.type === "percent" ? { percent_off: Math.min(100, promo.promo.value) } : { amount_off: promo.discountCents, currency: "usd" }),
      max_redemptions: 1,
      name: `OBSYDIA ${promo.promo.code}`,
      metadata: { promoCodeId: String(promo.promo._id) }
    });
    discounts = [{ coupon: coupon.id }];
  }
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: String(user._id),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: priceCents,
          recurring: { interval: "month" },
          product_data: { name: `OBSYDIA AI ${planId === "pro" ? "Pro" : "Premium"}`, metadata: { plan: planId } }
        }
      }
    ],
    discounts,
    metadata: { userId: String(user._id), plan: planId, promoCodeId: promo ? String(promo.promo._id) : "" },
    subscription_data: { metadata: { userId: String(user._id), plan: planId, promoCodeId: promo ? String(promo.promo._id) : "" } },
    success_url: `${env().APP_URL}/app/billing?checkout=success&provider=stripe&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env().APP_URL}/pricing?checkout=cancelled`
  });
  if (promo) await reservePromo(promo.promo._id, user._id, planId, "stripe", session.id, promo.discountCents);
  return { url: session.url, id: session.id };
}

function periodEnd(sub: any): Date | null {
  const ts = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end;
  return ts ? new Date(ts * 1000) : null;
}

async function syncFromSubscription(subId: string, promoRef?: string) {
  const s = stripe();
  const sub: any = await s.subscriptions.retrieve(subId);
  const userId = sub.metadata?.userId;
  const plan = sub.metadata?.plan;
  if (!userId || (plan !== "pro" && plan !== "premium")) {
    logger.warn({ subId }, "stripe subscription without OBSYDIA metadata");
    return;
  }
  if (sub.status === "active" || sub.status === "trialing") {
    await activateSubscription({ userId, plan, provider: "stripe", providerSubscriptionId: sub.id, currentPeriodEnd: periodEnd(sub), promoCodeId: sub.metadata?.promoCodeId || null });
    if (promoRef) await redeemPromo(promoRef);
    if (sub.cancel_at_period_end) await updateSubscriptionStatus("stripe", sub.id, "active", { cancelAtPeriodEnd: true });
  } else if (sub.status === "past_due" || sub.status === "unpaid") {
    await updateSubscriptionStatus("stripe", sub.id, "past_due");
  } else if (sub.status === "canceled" || sub.status === "incomplete_expired") {
    await updateSubscriptionStatus("stripe", sub.id, "canceled");
  }
}

export async function handleStripeWebhook(rawBody: Buffer, signature: string | undefined) {
  const e = env();
  if (!e.STRIPE_WEBHOOK_SECRET) throw unavailable("stripe_not_configured");
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature || "", e.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw new AppError(400, "invalid_signature", "Webhook signature verification failed");
  }
  try {
    await WebhookEvent.create({ provider: "stripe", eventId: event.id, type: event.type });
  } catch (err: any) {
    if (err?.code === 11000) {
      const existing = await WebhookEvent.findOne({ provider: "stripe", eventId: event.id }).lean<any>();
      if (existing?.processedAt) return { duplicate: true };
    } else throw err;
  }
  try {
    await processStripeEvent(event);
    await WebhookEvent.updateOne({ provider: "stripe", eventId: event.id }, { $set: { processedAt: new Date(), error: null } });
  } catch (err) {
    await WebhookEvent.updateOne({ provider: "stripe", eventId: event.id }, { $set: { error: (err as Error).message.slice(0, 300) } });
    throw err;
  }
  return { received: true };
}

async function processStripeEvent(event: Stripe.Event) {
  const obj: any = event.data.object;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      if (obj.mode === "subscription" && obj.subscription && (obj.payment_status === "paid" || obj.payment_status === "no_payment_required")) {
        await syncFromSubscription(String(obj.subscription), obj.id);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await syncFromSubscription(obj.id);
      break;
    case "customer.subscription.deleted":
      await updateSubscriptionStatus("stripe", obj.id, "canceled");
      break;
    case "invoice.paid":
    case "invoice.payment_succeeded": {
      const subId = obj.subscription || obj.parent?.subscription_details?.subscription;
      const userId = obj.subscription_details?.metadata?.userId || obj.parent?.subscription_details?.metadata?.userId || (subId ? (await Subscription.findOne({ provider: "stripe", providerSubscriptionId: subId }).lean<any>())?.userId : null);
      if (userId) {
        await recordPayment({ userId, provider: "stripe", providerPaymentId: obj.id, amountCents: obj.amount_paid ?? 0, currency: obj.currency || "usd", status: "succeeded", description: "Subscription invoice", subscriptionRef: subId || null });
      }
      if (subId) await syncFromSubscription(String(subId));
      break;
    }
    case "invoice.payment_failed": {
      const subId = obj.subscription || obj.parent?.subscription_details?.subscription;
      const sub = subId ? await Subscription.findOne({ provider: "stripe", providerSubscriptionId: subId }).lean<any>() : null;
      if (sub) {
        await recordPayment({ userId: sub.userId, provider: "stripe", providerPaymentId: obj.id, amountCents: obj.amount_due ?? 0, currency: obj.currency || "usd", status: "failed", description: "Failed subscription invoice", subscriptionRef: subId });
        await updateSubscriptionStatus("stripe", subId, "past_due");
      }
      break;
    }
    case "charge.refunded": {
      const invoiceId = obj.invoice;
      if (invoiceId) {
        const { Payment } = await import("../../models/index.js");
        const full = obj.amount_refunded >= obj.amount;
        await Payment.updateOne({ provider: "stripe", providerPaymentId: invoiceId }, { $set: { status: full ? "refunded" : "partially_refunded", refundedCents: obj.amount_refunded } });
      }
      break;
    }
    default:
      break;
  }
}

export async function cancelStripeSubscription(subId: string) {
  const sub: any = await stripe().subscriptions.update(subId, { cancel_at_period_end: true });
  await updateSubscriptionStatus("stripe", subId, "active", { cancelAtPeriodEnd: true, currentPeriodEnd: periodEnd(sub) });
}

export async function resumeStripeSubscription(subId: string) {
  await stripe().subscriptions.update(subId, { cancel_at_period_end: false });
  await updateSubscriptionStatus("stripe", subId, "active", { cancelAtPeriodEnd: false });
}

export async function confirmStripeSession(user: any, sessionId: string) {
  const session: any = await stripe().checkout.sessions.retrieve(sessionId);
  if (session.client_reference_id !== String(user._id)) throw new AppError(403, "forbidden");
  if (session.status === "complete" && session.subscription && (session.payment_status === "paid" || session.payment_status === "no_payment_required")) {
    await syncFromSubscription(String(session.subscription), session.id);
    return true;
  }
  return false;
}
