import Stripe from "stripe";
import { db } from "./db";
import { env } from "./env";
import { decrypt } from "./crypto";
import { HttpError } from "./http";
import { getSetting } from "./settings";
import { applyWalletTx, walletOperation } from "./wallet";
import { loadPricingContext, quote } from "./pricing";
import { createOrder } from "./orders";
import { audit, syslog } from "./audit";
import { emit, notify } from "./notify";

/** Secret keys come from env first, then the encrypted admin settings. Never sent to the browser. */
export async function stripeKeys() {
  const s = await getSetting("payments");
  const dec = (v: string | null) => {
    if (!v) return "";
    try {
      return decrypt(v);
    } catch {
      return "";
    }
  };
  return {
    secretKey: env.stripeSecretKey || dec(s.secretKeyEncrypted),
    webhookSecret: env.stripeWebhookSecret || dec(s.webhookSecretEncrypted),
    source: env.stripeSecretKey ? ("env" as const) : s.secretKeyEncrypted ? ("admin" as const) : ("none" as const),
  };
}

let cached: { key: string; client: Stripe } | null = null;
export async function getStripe() {
  const { secretKey } = await stripeKeys();
  if (!secretKey) throw new HttpError(503, "Card payments are not configured yet. Please contact support.", "payments_not_configured");
  if (!cached || cached.key !== secretKey) {
    cached = { key: secretKey, client: new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: "INCONNU SMS" } }) };
  }
  return cached.client;
}

async function createCheckout(p: {
  user: { id: string; email: string };
  amountCents: number;
  purpose: "TOPUP" | "ORDER";
  productName: string;
  description: string;
  metadata?: Record<string, string | number>;
  successPath: string;
}) {
  const settings = await getSetting("payments");
  if (!settings.enabled) throw new HttpError(503, "Card payments are currently disabled.", "payments_disabled");
  const stripe = await getStripe();

  // Anti double-payment: reuse a recent identical pending checkout instead of creating a new one
  const recent = await db.payment.findFirst({
    where: {
      userId: p.user.id,
      status: "PENDING",
      purpose: p.purpose,
      amountCents: p.amountCents,
      createdAt: { gte: new Date(Date.now() - 10 * 60_000) },
      stripeSessionId: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent?.stripeSessionId && JSON.stringify(recent.metadata) === JSON.stringify(p.metadata ?? {})) {
    const existing = await stripe.checkout.sessions.retrieve(recent.stripeSessionId).catch(() => null);
    if (existing?.status === "open" && existing.url) return { url: existing.url, paymentId: recent.id };
  }

  const payment = await db.payment.create({
    data: {
      userId: p.user.id,
      purpose: p.purpose,
      amountCents: p.amountCents,
      currency: settings.currency,
      metadata: p.metadata ?? {},
    },
  });
  const meta = { paymentId: payment.id, userId: p.user.id, purpose: p.purpose };
  // Dynamic price_data — no Stripe product catalog needed.
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: p.user.email,
      client_reference_id: p.user.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: settings.currency,
            unit_amount: p.amountCents,
            product_data: { name: p.productName, description: p.description },
          },
        },
      ],
      metadata: meta,
      payment_intent_data: { metadata: meta, description: p.productName },
      success_url: `${env.appUrl}${p.successPath}${p.successPath.includes("?") ? "&" : "?"}checkout=success&payment=${payment.id}`,
      cancel_url: `${env.appUrl}/dashboard/funds?checkout=cancelled`,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    },
    { idempotencyKey: `checkout:${payment.id}` },
  );
  await db.payment.update({ where: { id: payment.id }, data: { stripeSessionId: session.id } });
  return { url: session.url!, paymentId: payment.id };
}

export async function createTopupCheckout(user: { id: string; email: string }, amountCents: number) {
  const s = await getSetting("payments");
  if (!Number.isInteger(amountCents) || amountCents < s.minTopupCents || amountCents > s.maxTopupCents)
    throw new HttpError(422, `Amount must be between $${s.minTopupCents / 100} and $${s.maxTopupCents / 100}.`, "invalid_amount");
  return createCheckout({
    user,
    amountCents,
    purpose: "TOPUP",
    productName: "INCONNU SMS — Wallet top-up",
    description: `Add $${(amountCents / 100).toFixed(2)} to your INCONNU SMS wallet`,
    successPath: "/dashboard/funds",
  });
}

/** Pay a single number by card. The price is computed server-side from provider cost + admin margin. */
export async function createOrderCheckout(user: { id: string; email: string }, countryId: number, serviceId: number) {
  const s = await getSetting("payments");
  if (!s.allowDirectCardPurchase) throw new HttpError(403, "Direct card purchase is disabled. Please add funds first.", "disabled");
  const offering = await db.providerService.findFirst({
    where: { countryId, serviceId, enabled: true, available: { gt: 0 }, provider: { enabled: true }, country: { enabled: true }, service: { enabled: true } },
    include: { country: true, service: true },
    orderBy: { costCents: "asc" },
  });
  if (!offering) throw new HttpError(409, "This service is currently out of stock for this country.", "out_of_stock");
  const q = quote(await loadPricingContext(), offering);
  // Stripe minimum charge is $0.50
  const amount = Math.max(q.priceCents, 50);
  return createCheckout({
    user,
    amountCents: amount,
    purpose: "ORDER",
    productName: `Virtual number — ${offering.service.name} (${offering.country.name})`,
    description: "Single-use virtual number for SMS reception. Delivered after payment confirmation.",
    metadata: { countryId, serviceId },
    successPath: "/dashboard/orders",
  });
}

async function fulfillCheckoutSession(session: Stripe.Checkout.Session) {
  const paymentId = session.metadata?.paymentId;
  if (!paymentId) throw new Error("Missing paymentId metadata");
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new Error(`Unknown payment ${paymentId}`);
  if (session.payment_status !== "paid") return; // async methods: wait for async_payment_succeeded
  if (session.amount_total !== payment.amountCents || session.currency !== payment.currency) {
    await syslog("error", "stripe", "Amount/currency mismatch — payment not credited", { paymentId, sessionId: session.id });
    await db.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: "amount_mismatch" } });
    return;
  }

  const credited = await db.$transaction(async (tx) => {
    const res = await tx.payment.updateMany({
      where: { id: payment.id, status: { in: ["PENDING", "EXPIRED", "FAILED"] } },
      data: {
        status: "SUCCEEDED",
        completedAt: new Date(),
        stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
      },
    });
    if (res.count === 0) return false; // already processed
    await applyWalletTx(tx, {
      userId: payment.userId,
      amountCents: payment.amountCents,
      type: "CREDIT",
      description: payment.purpose === "ORDER" ? "Card payment for number purchase" : "Wallet top-up (card)",
      idempotencyKey: `stripe:payment:${payment.id}`,
      paymentId: payment.id,
    });
    return true;
  });
  if (!credited) return;

  await notify(payment.userId, "Payment confirmed", `$${(payment.amountCents / 100).toFixed(2)} added to your wallet.`, "/dashboard/transactions");
  emit(payment.userId, "wallet.credited", { payment_id: payment.id, amount_cents: payment.amountCents });

  if (payment.purpose === "ORDER") {
    const m = payment.metadata as { countryId?: number; serviceId?: number };
    try {
      await createOrder({ userId: payment.userId, countryId: Number(m.countryId), serviceId: Number(m.serviceId), idempotencyKey: `payment:${payment.id}` });
    } catch (e) {
      // Funds stay safely in the wallet if the number could not be reserved.
      await notify(payment.userId, "Number not delivered", `${(e as Error).message} Your payment remains available in your wallet.`, "/dashboard/buy");
    }
  }
}

/** Idempotent Stripe webhook processing (dedup on event id). */
export async function handleStripeEvent(event: Stripe.Event) {
  const existing = await db.inboundEvent.findUnique({ where: { source_eventId: { source: "stripe", eventId: event.id } } });
  if (existing?.processedAt) return { duplicate: true };
  const rec = existing ?? (await db.inboundEvent.create({ data: { source: "stripe", eventId: event.id, type: event.type } }).catch(() => null));
  if (!rec) return { duplicate: true }; // concurrent delivery

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await fulfillCheckoutSession(event.data.object);
        break;
      case "checkout.session.async_payment_failed": {
        const id = event.data.object.metadata?.paymentId;
        if (id) await db.payment.updateMany({ where: { id, status: "PENDING" }, data: { status: "FAILED", failureReason: "async_payment_failed" } });
        break;
      }
      case "checkout.session.expired": {
        const id = event.data.object.metadata?.paymentId;
        if (id) await db.payment.updateMany({ where: { id, status: "PENDING" }, data: { status: "EXPIRED" } });
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object;
        const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        if (pi) {
          const p = await db.payment.findUnique({ where: { stripePaymentIntentId: pi } });
          if (p) {
            await db.payment.update({
              where: { id: p.id },
              data: {
                refundedCents: charge.amount_refunded,
                status: charge.amount_refunded >= p.amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED",
              },
            });
          }
        }
        break;
      }
      default:
        break;
    }
    await db.inboundEvent.update({ where: { id: rec.id }, data: { processedAt: new Date(), error: null } });
    return { processed: true };
  } catch (e) {
    await db.inboundEvent.update({ where: { id: rec.id }, data: { error: String((e as Error).message).slice(0, 500) } });
    await syslog("error", "stripe", `Webhook ${event.type} failed: ${(e as Error).message}`, { eventId: event.id });
    throw e;
  }
}

/**
 * Refund (part of) a card payment back to the card. The wallet is debited first
 * so a user can never get both the balance and the card refund.
 */
export async function refundPaymentToCard(p: { paymentId: string; amountCents: number; reason: string; adminId: string }) {
  const payment = await db.payment.findUnique({ where: { id: p.paymentId } });
  if (!payment || !payment.stripePaymentIntentId || !["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(payment.status))
    throw new HttpError(409, "Payment cannot be refunded.", "not_refundable");
  if (p.amountCents <= 0 || p.amountCents > payment.amountCents - payment.refundedCents)
    throw new HttpError(422, "Refund amount exceeds the refundable amount.", "invalid_amount");

  const refund = await db.$transaction(async (tx) => {
    const r = await tx.refund.create({
      data: { userId: payment.userId, paymentId: payment.id, amountCents: p.amountCents, reason: p.reason, target: "CARD", status: "PENDING", processedById: p.adminId },
    });
    await applyWalletTx(tx, {
      userId: payment.userId,
      amountCents: -p.amountCents,
      type: "WITHDRAWAL",
      description: `Card refund of payment ${payment.id.slice(-8)}`,
      idempotencyKey: `card-refund:${r.id}`,
      paymentId: payment.id,
      refundId: r.id,
      actorId: p.adminId,
    });
    await tx.payment.update({ where: { id: payment.id }, data: { refundedCents: { increment: p.amountCents } } });
    return r;
  });

  try {
    const stripe = await getStripe();
    const sr = await stripe.refunds.create(
      { payment_intent: payment.stripePaymentIntentId, amount: p.amountCents, metadata: { refundId: refund.id } },
      { idempotencyKey: `refund:${refund.id}` },
    );
    await db.refund.update({ where: { id: refund.id }, data: { status: "COMPLETED", stripeRefundId: sr.id, processedAt: new Date() } });
    const updated = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    await db.payment.update({
      where: { id: payment.id },
      data: { status: updated.refundedCents >= updated.amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED" },
    });
    await audit({ actorId: p.adminId, action: "refund.card", entity: "payment", entityId: payment.id, metadata: { amountCents: p.amountCents } });
    return refund;
  } catch (e) {
    // Roll the wallet back if Stripe refused the refund
    await db.$transaction([
      db.refund.update({ where: { id: refund.id }, data: { status: "FAILED", processedAt: new Date() } }),
      db.payment.update({ where: { id: payment.id }, data: { refundedCents: { decrement: p.amountCents } } }),
    ]);
    await walletOperation({
      userId: payment.userId,
      amountCents: p.amountCents,
      type: "ADJUSTMENT",
      description: "Reversal — card refund failed",
      idempotencyKey: `card-refund-reversal:${refund.id}`,
      refundId: refund.id,
    });
    throw new HttpError(502, `Stripe refund failed: ${(e as Error).message}`, "stripe_error");
  }
}
