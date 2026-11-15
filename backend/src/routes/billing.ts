import { Router } from "express";
import { z } from "zod";
import { Payment, Subscription, TokenTransaction } from "../models/index.js";
import { requireVerified } from "../middleware/auth.js";
import { body, parse } from "../lib/validate.js";
import { badRequest, notFound } from "../lib/errors.js";
import { getPlan, getPlans } from "../services/settings.js";
import { evaluatePromo } from "../services/billing/promo.js";
import { cancelStripeSubscription, confirmStripeSession, createStripeCheckout, resumeStripeSubscription, stripeConfigured } from "../services/billing/stripe.js";
import { cancelPaypal, confirmPaypal, createPaypalSubscription, paypalConfigured } from "../services/billing/paypal.js";
import { getBalanceView } from "../services/tokens.js";
import { audit } from "../lib/audit.js";
import { limiter } from "../lib/rateLimit.js";

export const billingRouter = Router();
billingRouter.use(requireVerified);

const checkoutLimiter = limiter("checkout", { windowMs: 15 * 60_000, limit: 15, keyGenerator: (req) => String((req as any).user?._id) });

billingRouter.get("/overview", async (req, res) => {
  const [subs, payments, plan] = await Promise.all([
    Subscription.find({ userId: req.user._id, status: { $ne: "pending" } }).sort({ createdAt: -1 }).limit(10).lean<any[]>(),
    Payment.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50).lean<any[]>(),
    getPlan(req.user.plan)
  ]);
  res.json({
    plan: req.user.plan,
    planDetails: plan,
    planExpiresAt: req.user.planExpiresAt,
    providers: { stripe: stripeConfigured(), paypal: paypalConfigured() },
    subscriptions: subs.map((s) => ({
      id: String(s._id),
      plan: s.plan,
      provider: s.provider,
      status: s.status,
      currentPeriodEnd: s.currentPeriodEnd,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      createdAt: s.createdAt
    })),
    payments: payments.map((p) => ({
      id: String(p._id),
      provider: p.provider,
      amountCents: p.amountCents,
      refundedCents: p.refundedCents,
      currency: p.currency,
      status: p.status,
      plan: p.plan,
      description: p.description,
      createdAt: p.createdAt
    }))
  });
});

billingRouter.post("/promo/validate", async (req, res) => {
  const input = body(req, z.object({ code: z.string().trim().min(2).max(40), plan: z.enum(["pro", "premium"]) }));
  const plan = await getPlan(input.plan);
  const priceCents = Math.round(plan.priceUsd * 100);
  const r = await evaluatePromo(input.code, input.plan, priceCents);
  res.json({ code: r!.promo.code, type: r!.promo.type, value: r!.promo.value, discountCents: r!.discountCents, finalCents: r!.finalCents, priceCents });
});

billingRouter.post("/checkout", checkoutLimiter, async (req, res) => {
  const input = body(req, z.object({ plan: z.enum(["pro", "premium"]), provider: z.enum(["stripe", "paypal"]), promoCode: z.string().trim().max(40).optional() }));
  const active = await Subscription.findOne({ userId: req.user._id, status: { $in: ["active", "past_due"] } }).lean<any>();
  if (active && active.plan === input.plan) throw badRequest("already_subscribed", "You already have this plan");
  const result =
    input.provider === "stripe"
      ? await createStripeCheckout(req.user, input.plan, input.promoCode || undefined)
      : await createPaypalSubscription(req.user, input.plan, input.promoCode || undefined);
  await audit(req, "billing.checkout_started", { meta: { plan: input.plan, provider: input.provider } });
  res.json(result);
});

billingRouter.post("/confirm", async (req, res) => {
  const input = body(req, z.object({ provider: z.enum(["stripe", "paypal"]), reference: z.string().min(5).max(200) }));
  const ok = input.provider === "stripe" ? await confirmStripeSession(req.user, input.reference) : await confirmPaypal(req.user, input.reference);
  res.json({ active: ok, balance: await getBalanceView(req.user._id) });
});

billingRouter.post("/subscriptions/:id/cancel", async (req, res) => {
  const sub = await Subscription.findOne({ _id: String(req.params.id), userId: req.user._id }).lean<any>();
  if (!sub) throw notFound("subscription_not_found");
  if (sub.provider === "stripe") await cancelStripeSubscription(sub.providerSubscriptionId);
  else if (sub.provider === "paypal") await cancelPaypal(sub.providerSubscriptionId);
  await audit(req, "billing.subscription_cancel", { targetType: "subscription", targetId: sub._id });
  res.json({ ok: true });
});

billingRouter.post("/subscriptions/:id/resume", async (req, res) => {
  const sub = await Subscription.findOne({ _id: String(req.params.id), userId: req.user._id, provider: "stripe" }).lean<any>();
  if (!sub) throw notFound("subscription_not_found");
  await resumeStripeSubscription(sub.providerSubscriptionId);
  res.json({ ok: true });
});

export const tokensRouter = Router();
tokensRouter.use(requireVerified);

tokensRouter.get("/", async (req, res) => {
  res.json({ balance: await getBalanceView(req.user._id) });
});

tokensRouter.get("/history", async (req, res) => {
  const q = parse(z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(30) }), req.query);
  const [items, total, daily] = await Promise.all([
    TokenTransaction.find({ userId: req.user._id }).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean<any[]>(),
    TokenTransaction.countDocuments({ userId: req.user._id }),
    TokenTransaction.aggregate([
      { $match: { userId: req.user._id, type: "usage", createdAt: { $gte: new Date(Date.now() - 14 * 86400_000) } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, tokens: { $sum: { $abs: "$amount" } }, requests: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ])
  ]);
  res.json({
    total,
    page: q.page,
    items: items.map((t) => ({
      id: String(t._id),
      type: t.type,
      amount: t.amount,
      source: t.source,
      promptTokens: t.promptTokens,
      completionTokens: t.completionTokens,
      estimated: t.estimated,
      feature: t.feature,
      via: t.via,
      note: t.note,
      balanceAfter: t.balanceAfter,
      createdAt: t.createdAt
    })),
    daily: daily.map((d) => ({ day: d._id, tokens: d.tokens, requests: d.requests }))
  });
});

export async function publicPlans() {
  const plans = await getPlans();
  return Object.values(plans).map((p) => ({ ...p }));
}
