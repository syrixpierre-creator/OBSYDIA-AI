import { env } from "../../config/env.js";
import { AppError, unavailable } from "../../lib/errors.js";
import { Subscription, User, WebhookEvent } from "../../models/index.js";
import { getPlan } from "../settings.js";
import { evaluatePromo, redeemPromo, reservePromo } from "./promo.js";
import { activateSubscription, recordPayment, updateSubscriptionStatus } from "./subscriptions.js";

let cachedToken: { token: string; exp: number } | null = null;
export let paypalFetch: typeof fetch = (...args) => fetch(...args);
export function setPaypalFetch(f: typeof fetch) {
  paypalFetch = f;
  cachedToken = null;
}

export function paypalConfigured() {
  const e = env();
  return Boolean(e.PAYPAL_CLIENT_ID && e.PAYPAL_CLIENT_SECRET);
}

function base() {
  return env().PAYPAL_MODE === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

async function token() {
  if (!paypalConfigured()) throw unavailable("paypal_not_configured", "PayPal is not configured");
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
  const e = env();
  const res = await paypalFetch(`${base()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${e.PAYPAL_CLIENT_ID}:${e.PAYPAL_CLIENT_SECRET}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  if (!res.ok) throw new AppError(502, "paypal_auth_failed", "PayPal authentication failed");
  const json: any = await res.json();
  cachedToken = { token: json.access_token, exp: Date.now() + json.expires_in * 1000 };
  return cachedToken.token;
}

async function api(path: string, init: RequestInit = {}) {
  const res = await paypalFetch(`${base()}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await token()}`, "content-type": "application/json", ...(init.headers || {}) }
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new AppError(502, "paypal_error", json?.message || `PayPal request failed (${res.status})`);
  return json;
}

function planIdFor(plan: "pro" | "premium") {
  const id = plan === "pro" ? env().PAYPAL_PLAN_ID_PRO : env().PAYPAL_PLAN_ID_PREMIUM;
  if (!id) throw unavailable("paypal_plan_missing", `PAYPAL_PLAN_ID_${plan.toUpperCase()} is not configured`);
  return id;
}

export async function createPaypalSubscription(user: any, planId: "pro" | "premium", promoCode?: string) {
  const plan = await getPlan(planId);
  const priceCents = Math.round(plan.priceUsd * 100);
  const promo = await evaluatePromo(promoCode, planId, priceCents);
  const body: any = {
    plan_id: planIdFor(planId),
    custom_id: `${user._id}:${planId}`,
    subscriber: { email_address: user.email },
    application_context: {
      brand_name: env().APP_NAME,
      user_action: "SUBSCRIBE_NOW",
      shipping_preference: "NO_SHIPPING",
      return_url: `${env().APP_URL}/app/billing?checkout=success&provider=paypal`,
      cancel_url: `${env().APP_URL}/pricing?checkout=cancelled`
    }
  };
  if (promo && promo.discountCents > 0) {
    body.plan = {
      billing_cycles: [
        { sequence: 1, total_cycles: 1, pricing_scheme: { fixed_price: { value: (promo.finalCents / 100).toFixed(2), currency_code: "USD" } } },
        { sequence: 2, total_cycles: 0, pricing_scheme: { fixed_price: { value: (priceCents / 100).toFixed(2), currency_code: "USD" } } }
      ]
    };
  }
  const sub = await api("/v1/billing/subscriptions", { method: "POST", body: JSON.stringify(body) });
  const approve = (sub.links || []).find((l: any) => l.rel === "approve")?.href;
  await Subscription.updateOne(
    { provider: "paypal", providerSubscriptionId: sub.id },
    { $setOnInsert: { userId: user._id, plan: planId, status: "pending", promoCodeId: promo?.promo._id ?? null } },
    { upsert: true }
  );
  if (promo) await reservePromo(promo.promo._id, user._id, planId, "paypal", sub.id, promo.discountCents);
  return { url: approve, id: sub.id };
}

async function syncPaypal(subId: string) {
  const sub = await api(`/v1/billing/subscriptions/${encodeURIComponent(subId)}`);
  const [userId, plan] = String(sub.custom_id || "").split(":");
  if (!userId || (plan !== "pro" && plan !== "premium")) return null;
  const next = sub.billing_info?.next_billing_time ? new Date(sub.billing_info.next_billing_time) : null;
  if (sub.status === "ACTIVE") {
    await activateSubscription({ userId, plan, provider: "paypal", providerSubscriptionId: sub.id, currentPeriodEnd: next });
    await redeemPromo(sub.id);
  } else if (sub.status === "SUSPENDED") await updateSubscriptionStatus("paypal", sub.id, "past_due");
  else if (sub.status === "CANCELLED") await updateSubscriptionStatus("paypal", sub.id, "canceled");
  else if (sub.status === "EXPIRED") await updateSubscriptionStatus("paypal", sub.id, "expired");
  return { userId, plan, status: sub.status };
}

export async function confirmPaypal(user: any, subId: string) {
  const local = await Subscription.findOne({ provider: "paypal", providerSubscriptionId: subId }).lean<any>();
  if (!local || String(local.userId) !== String(user._id)) throw new AppError(403, "forbidden");
  const r = await syncPaypal(subId);
  return r?.status === "ACTIVE";
}

export async function cancelPaypal(subId: string) {
  await api(`/v1/billing/subscriptions/${encodeURIComponent(subId)}/cancel`, { method: "POST", body: JSON.stringify({ reason: "Cancelled by customer" }) });
  await updateSubscriptionStatus("paypal", subId, "canceled");
}

export async function handlePaypalWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>) {
  const e = env();
  if (!e.PAYPAL_WEBHOOK_ID) throw unavailable("paypal_not_configured");
  const event = JSON.parse(rawBody.toString("utf8"));
  const h = (k: string) => String(headers[k] || "");
  const verification = await api("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: JSON.stringify({
      auth_algo: h("paypal-auth-algo"),
      cert_url: h("paypal-cert-url"),
      transmission_id: h("paypal-transmission-id"),
      transmission_sig: h("paypal-transmission-sig"),
      transmission_time: h("paypal-transmission-time"),
      webhook_id: e.PAYPAL_WEBHOOK_ID,
      webhook_event: event
    })
  });
  if (verification.verification_status !== "SUCCESS") throw new AppError(400, "invalid_signature", "PayPal webhook verification failed");
  try {
    await WebhookEvent.create({ provider: "paypal", eventId: event.id, type: event.event_type });
  } catch (err: any) {
    if (err?.code === 11000) {
      const existing = await WebhookEvent.findOne({ provider: "paypal", eventId: event.id }).lean<any>();
      if (existing?.processedAt) return { duplicate: true };
    } else throw err;
  }
  const r = event.resource || {};
  switch (event.event_type) {
    case "BILLING.SUBSCRIPTION.ACTIVATED":
    case "BILLING.SUBSCRIPTION.UPDATED":
    case "BILLING.SUBSCRIPTION.RE-ACTIVATED":
    case "BILLING.SUBSCRIPTION.SUSPENDED":
    case "BILLING.SUBSCRIPTION.CANCELLED":
    case "BILLING.SUBSCRIPTION.EXPIRED":
      await syncPaypal(r.id);
      break;
    case "BILLING.SUBSCRIPTION.PAYMENT.FAILED": {
      const sub = await Subscription.findOne({ provider: "paypal", providerSubscriptionId: r.id }).lean<any>();
      if (sub) {
        await recordPayment({ userId: sub.userId, provider: "paypal", providerPaymentId: `${event.id}`, amountCents: 0, currency: "usd", status: "failed", subscriptionRef: r.id, description: "PayPal payment failed" });
        await updateSubscriptionStatus("paypal", r.id, "past_due");
      }
      break;
    }
    case "PAYMENT.SALE.COMPLETED": {
      const subId = r.billing_agreement_id;
      const sub = subId ? await Subscription.findOne({ provider: "paypal", providerSubscriptionId: subId }).lean<any>() : null;
      if (sub) {
        await recordPayment({ userId: sub.userId, provider: "paypal", providerPaymentId: r.id, amountCents: Math.round(Number(r.amount?.total || 0) * 100), currency: String(r.amount?.currency || "USD").toLowerCase(), status: "succeeded", subscriptionRef: subId, description: "PayPal subscription payment" });
        await syncPaypal(subId);
      }
      break;
    }
    case "PAYMENT.SALE.REFUNDED": {
      const { Payment } = await import("../../models/index.js");
      if (r.sale_id) await Payment.updateOne({ provider: "paypal", providerPaymentId: r.sale_id }, { $set: { status: "refunded", refundedCents: Math.round(Number(r.amount?.total || 0) * 100) } });
      break;
    }
    default:
      break;
  }
  await WebhookEvent.updateOne({ provider: "paypal", eventId: event.id }, { $set: { processedAt: new Date() } });
  return { received: true };
}

export { User };
