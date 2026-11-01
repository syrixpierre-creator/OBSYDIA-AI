import { Router } from "express";
import { z } from "zod";
import {
  ApiUsage, AuditLog, Payment, Project, PromoCode, PromoRedemption, ProviderKey, ProviderUsage, Referral, ReferralReward,
  Subscription, Team, TeamMember, TokenTransaction, User, Message, AdminSetting
} from "../models/index.js";
import { requireAdmin } from "../middleware/auth.js";
import { body, escapeRegex, objectId, parse } from "../lib/validate.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { encrypt, maskSecret, sha256 } from "../lib/crypto.js";
import { audit } from "../lib/audit.js";
import { providerManager } from "../services/ai/providerManager.js";
import { envAiSettings, getAiOverrides, getAiSettings, getPlanOverrides, getPlans, writeSetting } from "../services/settings.js";
import { applyPlanToBalance, getBalanceView, grantBonus } from "../services/tokens.js";
import { publicUser } from "../services/users.js";
import { Session } from "../models/index.js";

export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get("/stats", async (_req, res) => {
  const now = Date.now();
  const d30 = new Date(now - 30 * 86400_000);
  const d7 = new Date(now - 7 * 86400_000);
  const [users, active, newUsers, plans, revenue, failed, tokens, apiReq, projects, referrals, rewards, regSeries, tokenSeries] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ lastActiveAt: { $gte: d7 } }),
    User.countDocuments({ createdAt: { $gte: d30 } }),
    User.aggregate([{ $group: { _id: "$plan", n: { $sum: 1 } } }]),
    Payment.aggregate([{ $match: { status: { $in: ["succeeded", "partially_refunded"] } } }, { $group: { _id: null, cents: { $sum: { $subtract: ["$amountCents", "$refundedCents"] } }, n: { $sum: 1 } } }]),
    Payment.countDocuments({ status: "failed" }),
    TokenTransaction.aggregate([{ $match: { type: "usage", createdAt: { $gte: d30 } } }, { $group: { _id: null, t: { $sum: { $abs: "$amount" } }, n: { $sum: 1 } } }]),
    ApiUsage.countDocuments({ createdAt: { $gte: d30 } }),
    Project.countDocuments(),
    Referral.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    ReferralReward.aggregate([{ $group: { _id: null, t: { $sum: "$tokens" }, n: { $sum: 1 } } }]),
    User.aggregate([{ $match: { createdAt: { $gte: d30 } } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, n: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    TokenTransaction.aggregate([{ $match: { type: "usage", createdAt: { $gte: d30 } } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, t: { $sum: { $abs: "$amount" } } } }, { $sort: { _id: 1 } }])
  ]);
  const planCount = Object.fromEntries(plans.map((p: any) => [p._id, p.n]));
  const refCount = Object.fromEntries(referrals.map((p: any) => [p._id, p.n]));
  res.json({
    users: { total: users, active7d: active, new30d: newUsers, free: planCount.free || 0, pro: planCount.pro || 0, premium: planCount.premium || 0, custom: planCount.custom || 0 },
    revenue: { totalCents: revenue[0]?.cents || 0, payments: revenue[0]?.n || 0, failedPayments: failed },
    tokens: { consumed30d: tokens[0]?.t || 0, requests30d: tokens[0]?.n || 0 },
    api: { requests30d: apiReq },
    projects: { total: projects },
    referrals: { pending: refCount.pending || 0, qualified: refCount.qualified || 0, rejected: refCount.rejected || 0, rewards: rewards[0]?.n || 0, rewardTokens: rewards[0]?.t || 0 },
    series: { registrations: regSeries.map((r: any) => ({ day: r._id, value: r.n })), tokens: tokenSeries.map((r: any) => ({ day: r._id, value: r.t })) },
    provider: providerManager.availability()
  });
});

adminRouter.get("/users", async (req, res) => {
  const q = parse(
    z.object({
      q: z.string().max(200).optional(),
      plan: z.enum(["free", "pro", "premium", "custom"]).optional(),
      status: z.enum(["active", "suspended"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25)
    }),
    req.query
  );
  const filter: Record<string, unknown> = {};
  if (q.q) filter.$or = [{ email: { $regex: escapeRegex(q.q), $options: "i" } }, { name: { $regex: escapeRegex(q.q), $options: "i" } }];
  if (q.plan) filter.plan = q.plan;
  if (q.status) filter.status = q.status;
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean<any[]>(),
    User.countDocuments(filter)
  ]);
  res.json({ total, page: q.page, users: items.map((u) => ({ ...publicUser(u), lastActiveAt: u.lastActiveAt, suspendedReason: u.suspendedReason })) });
});

adminRouter.get("/users/:id", async (req, res) => {
  const user = await User.findById(parse(objectId, String(req.params.id))).lean<any>();
  if (!user) throw notFound("user_not_found");
  const [balance, txs, subs, payments, referrals, projects, messages] = await Promise.all([
    getBalanceView(user._id),
    TokenTransaction.find({ userId: user._id }).sort({ createdAt: -1 }).limit(30).lean<any[]>(),
    Subscription.find({ userId: user._id }).sort({ createdAt: -1 }).lean<any[]>(),
    Payment.find({ userId: user._id }).sort({ createdAt: -1 }).limit(20).lean<any[]>(),
    Referral.countDocuments({ referrerId: user._id, status: "qualified" }),
    Project.countDocuments({ userId: user._id }),
    Message.countDocuments({ userId: user._id })
  ]);
  res.json({
    user: { ...publicUser(user), lastActiveAt: user.lastActiveAt, lastLoginAt: user.lastLoginAt, suspendedReason: user.suspendedReason },
    balance,
    transactions: txs,
    subscriptions: subs,
    payments,
    stats: { qualifiedReferrals: referrals, projects, messages }
  });
});

adminRouter.post("/users/:id/suspend", async (req, res) => {
  const input = body(req, z.object({ reason: z.string().trim().max(300).default("") }));
  const id = parse(objectId, String(req.params.id));
  if (id === String(req.user._id)) throw badRequest("cannot_suspend_self");
  const r = await User.updateOne({ _id: id }, { $set: { status: "suspended", suspendedReason: input.reason }, $inc: { sessionVersion: 1 } });
  if (!r.matchedCount) throw notFound("user_not_found");
  await Session.updateMany({ userId: id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  await audit(req, "admin.user_suspended", { targetType: "user", targetId: id, meta: { reason: input.reason } });
  res.json({ ok: true });
});

adminRouter.post("/users/:id/reactivate", async (req, res) => {
  const id = parse(objectId, String(req.params.id));
  const r = await User.updateOne({ _id: id }, { $set: { status: "active", suspendedReason: null } });
  if (!r.matchedCount) throw notFound("user_not_found");
  await audit(req, "admin.user_reactivated", { targetType: "user", targetId: id });
  res.json({ ok: true });
});

adminRouter.patch("/users/:id", async (req, res) => {
  const id = parse(objectId, String(req.params.id));
  const input = body(
    req,
    z.object({ plan: z.enum(["free", "pro", "premium", "custom"]).optional(), planExpiresAt: z.coerce.date().nullable().optional(), role: z.enum(["user", "admin"]).optional(), emailVerified: z.boolean().optional() })
  );
  const user = await User.findById(id);
  if (!user) throw notFound("user_not_found");
  if (input.role && id === String(req.user._id) && input.role !== "admin") throw badRequest("cannot_demote_self");
  if (input.plan) {
    user.plan = input.plan;
    user.planExpiresAt = input.planExpiresAt ?? null;
  }
  if (input.role) user.role = input.role;
  if (input.emailVerified !== undefined) user.emailVerified = input.emailVerified;
  await user.save();
  if (input.plan) await applyPlanToBalance(user._id, input.plan, true);
  await audit(req, "admin.user_updated", { targetType: "user", targetId: id, meta: input as Record<string, unknown> });
  res.json({ user: publicUser(user) });
});

adminRouter.post("/users/:id/tokens", async (req, res) => {
  const id = parse(objectId, String(req.params.id));
  const input = body(req, z.object({ amount: z.number().int().min(-10_000_000).max(10_000_000).refine((v) => v !== 0), note: z.string().trim().min(2).max(200) }));
  if (!(await User.exists({ _id: id }))) throw notFound("user_not_found");
  const balance = await grantBonus(id, input.amount, "admin_adjustment", `${input.note} (by ${req.user.email})`);
  await audit(req, "admin.tokens_adjusted", { targetType: "user", targetId: id, meta: input });
  res.json({ balance });
});

const aiSchema = z.object({
  displayName: z.string().trim().max(60).optional(),
  personality: z.string().trim().max(2000).optional(),
  systemPrompt: z.string().trim().max(20_000).optional(),
  welcomeMessage: z.string().trim().max(500).optional(),
  defaultLanguage: z.enum(["auto", "en", "fr"]).optional(),
  model: z.string().trim().max(200).optional(),
  models: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
  capabilities: z.object({ vision: z.boolean(), audio: z.boolean(), tools: z.boolean() }).partial().optional(),
  maxOutputTokens: z.number().int().min(256).max(64_000).optional()
});

adminRouter.get("/ai-settings", async (_req, res) => {
  res.json({ effective: await getAiSettings(), overrides: await getAiOverrides(), defaults: envAiSettings() });
});

adminRouter.put("/ai-settings", async (req, res) => {
  const input = body(req, aiSchema);
  await writeSetting("ai", input, req.user._id);
  await audit(req, "admin.ai_settings_updated", { meta: { fields: Object.keys(input) } });
  res.json({ effective: await getAiSettings(), overrides: input });
});

adminRouter.get("/plans", async (_req, res) => {
  res.json({ plans: await getPlans(), overrides: await getPlanOverrides() });
});

adminRouter.put("/plans", async (req, res) => {
  const entry = z.object({ tokenLimit: z.number().int().min(0).max(1e9).optional(), resetHours: z.number().min(1).max(24 * 90).optional(), priceUsd: z.number().min(0).max(10_000).optional() });
  const input = body(req, z.object({ free: entry.optional(), pro: entry.optional(), premium: entry.optional(), custom: entry.optional() }));
  await writeSetting("plans", input, req.user._id);
  await audit(req, "admin.plans_updated", { meta: input as Record<string, unknown> });
  res.json({ plans: await getPlans(), overrides: input });
});

adminRouter.get("/provider-keys", async (_req, res) => {
  await providerManager.refresh(true);
  const today = new Date().toISOString().slice(0, 10);
  const usage = await ProviderUsage.aggregate([
    { $group: { _id: "$keyFingerprint", requests: { $sum: "$requests" }, errors: { $sum: "$errorCount" }, rateLimited: { $sum: "$rateLimited" }, promptTokens: { $sum: "$promptTokens" }, completionTokens: { $sum: "$completionTokens" }, lastSuccessAt: { $max: "$lastSuccessAt" }, lastErrorAt: { $max: "$lastErrorAt" } } }
  ]);
  const todayUsage = await ProviderUsage.find({ day: today }).lean<any[]>();
  const byFp = new Map(usage.map((u: any) => [u._id, u]));
  const todayByFp = new Map(todayUsage.map((u) => [u.keyFingerprint, u]));
  res.json({
    availability: providerManager.availability(),
    keys: providerManager.list().map((k) => {
      const u: any = byFp.get(k.fingerprint) || {};
      const t: any = todayByFp.get(k.fingerprint) || {};
      return {
        ...k,
        status: !k.enabled ? "disabled" : k.cooldownUntil > Date.now() ? "cooldown" : k.lastErrorAt && (!k.lastSuccessAt || k.lastErrorAt > k.lastSuccessAt) ? "degraded" : "healthy",
        totals: { requests: u.requests || 0, errors: u.errors || 0, rateLimited: u.rateLimited || 0, promptTokens: u.promptTokens || 0, completionTokens: u.completionTokens || 0, lastSuccessAt: u.lastSuccessAt || k.lastSuccessAt, lastErrorAt: u.lastErrorAt || k.lastErrorAt },
        today: { requests: t.requests || 0, errors: t.errors || 0, tokens: (t.promptTokens || 0) + (t.completionTokens || 0) },
        providerQuota: null
      };
    })
  });
});

adminRouter.post("/provider-keys", async (req, res) => {
  const input = body(req, z.object({ label: z.string().trim().min(1).max(60), owner: z.string().trim().max(80).default(""), key: z.string().trim().min(10).max(500), test: z.boolean().default(true) }));
  const fingerprint = sha256(`xkiro:${input.key}`).slice(0, 16);
  if ((await ProviderKey.exists({ fingerprint })) || providerManager.get(fingerprint)) throw conflict("key_exists", "This key is already configured");
  const doc = await ProviderKey.create({ label: input.label, owner: input.owner, encryptedKey: encrypt(input.key), fingerprint, masked: maskSecret(input.key), addedBy: req.user._id });
  await providerManager.refresh(true);
  await audit(req, "admin.provider_key_added", { targetType: "provider_key", targetId: doc._id, meta: { label: input.label, masked: doc.masked } });
  const test = input.test ? await providerManager.testKey(fingerprint) : null;
  res.status(201).json({ id: String(doc._id), fingerprint, masked: doc.masked, test });
});

adminRouter.patch("/provider-keys/:fingerprint", async (req, res) => {
  const input = body(req, z.object({ enabled: z.boolean().optional(), label: z.string().trim().min(1).max(60).optional(), owner: z.string().trim().max(80).optional() }));
  const fp = String(req.params.fingerprint);
  await providerManager.refresh(true);
  const key = providerManager.get(fp);
  if (!key) throw notFound("key_not_found");
  if (key.source === "dashboard") {
    const set: Record<string, unknown> = {};
    if (input.enabled !== undefined) set.enabled = input.enabled;
    if (input.label) set.label = input.label;
    if (input.owner !== undefined) set.owner = input.owner;
    await ProviderKey.updateOne({ fingerprint: fp }, { $set: set });
  } else if (input.enabled !== undefined) {
    const doc = await AdminSetting.findOne({ key: "provider_disabled_env" }).lean<any>();
    const list = new Set<string>(Array.isArray(doc?.value) ? doc.value : []);
    if (input.enabled) list.delete(fp);
    else list.add(fp);
    await writeSetting("provider_disabled_env", [...list], req.user._id);
  }
  await providerManager.refresh(true);
  await audit(req, "admin.provider_key_updated", { targetType: "provider_key", targetId: fp, meta: input });
  res.json({ ok: true });
});

adminRouter.delete("/provider-keys/:fingerprint", async (req, res) => {
  const fp = String(req.params.fingerprint);
  const r = await ProviderKey.deleteOne({ fingerprint: fp });
  if (!r.deletedCount) throw badRequest("cannot_delete", "Environment keys must be removed from XKIRO_API_KEYS in .env");
  await providerManager.refresh(true);
  await audit(req, "admin.provider_key_removed", { targetType: "provider_key", targetId: fp });
  res.json({ ok: true });
});

adminRouter.post("/provider-keys/:fingerprint/test", async (req, res) => {
  res.json(await providerManager.testKey(String(req.params.fingerprint)));
});

adminRouter.post("/provider-keys/:fingerprint/reset", async (req, res) => {
  providerManager.resetCooldown(String(req.params.fingerprint));
  res.json({ ok: true });
});

adminRouter.get("/provider-models", async (_req, res) => {
  const models = await providerManager.listModels();
  res.json({ available: models !== null, models: models || [] });
});

const promoSchema = z.object({
  code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/),
  description: z.string().trim().max(200).default(""),
  type: z.enum(["percent", "fixed"]),
  value: z.number().positive().max(10_000),
  plans: z.array(z.enum(["pro", "premium"])).min(1).default(["premium"]),
  maxUses: z.number().int().min(1).nullable().default(null),
  expiresAt: z.coerce.date().nullable().default(null),
  active: z.boolean().default(true)
});

adminRouter.get("/promo-codes", async (_req, res) => {
  const codes = await PromoCode.find().sort({ createdAt: -1 }).lean<any[]>();
  res.json({ codes: codes.map((c) => ({ ...c, id: String(c._id) })) });
});

adminRouter.post("/promo-codes", async (req, res) => {
  const input = body(req, promoSchema);
  if (input.type === "percent" && input.value > 100) throw badRequest("invalid_percent");
  if (await PromoCode.exists({ code: input.code.toUpperCase() })) throw conflict("code_exists");
  const doc = await PromoCode.create({ ...input, createdBy: req.user._id });
  await audit(req, "admin.promo_created", { targetType: "promo", targetId: doc._id, meta: { code: doc.code } });
  res.status(201).json({ code: { ...doc.toObject(), id: String(doc._id) } });
});

adminRouter.patch("/promo-codes/:id", async (req, res) => {
  const input = body(req, promoSchema.partial().omit({ code: true }));
  if (input.type === "percent" && input.value && input.value > 100) throw badRequest("invalid_percent");
  const r = await PromoCode.updateOne({ _id: parse(objectId, String(req.params.id)) }, { $set: input });
  if (!r.matchedCount) throw notFound("promo_not_found");
  await audit(req, "admin.promo_updated", { targetType: "promo", targetId: req.params.id, meta: input as Record<string, unknown> });
  res.json({ ok: true });
});

adminRouter.delete("/promo-codes/:id", async (req, res) => {
  const r = await PromoCode.deleteOne({ _id: parse(objectId, String(req.params.id)) });
  if (!r.deletedCount) throw notFound("promo_not_found");
  await audit(req, "admin.promo_deleted", { targetType: "promo", targetId: req.params.id });
  res.json({ ok: true });
});

adminRouter.get("/promo-codes/:id/usage", async (req, res) => {
  const uses = await PromoRedemption.find({ promoCodeId: parse(objectId, String(req.params.id)) }).sort({ createdAt: -1 }).limit(200).populate("userId", "email name").lean<any[]>();
  res.json({ usage: uses.map((u) => ({ id: String(u._id), user: u.userId?.email, plan: u.plan, provider: u.provider, status: u.status, discountCents: u.discountCents, createdAt: u.createdAt })) });
});

adminRouter.get("/payments", async (req, res) => {
  const q = parse(z.object({ page: z.coerce.number().int().min(1).default(1), status: z.string().max(30).optional() }), req.query);
  const filter = q.status ? { status: q.status } : {};
  const [items, total] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * 30).limit(30).populate("userId", "email").lean<any[]>(),
    Payment.countDocuments(filter)
  ]);
  res.json({ total, payments: items.map((p) => ({ ...p, id: String(p._id), user: p.userId?.email })) });
});

adminRouter.get("/subscriptions", async (_req, res) => {
  const items = await Subscription.find({ status: { $ne: "pending" } }).sort({ createdAt: -1 }).limit(200).populate("userId", "email").lean<any[]>();
  res.json({ subscriptions: items.map((s) => ({ ...s, id: String(s._id), user: s.userId?.email })) });
});

adminRouter.get("/teams", async (_req, res) => {
  const teams = await Team.find().sort({ createdAt: -1 }).limit(200).populate("ownerId", "email plan").lean<any[]>();
  const counts = await TeamMember.aggregate([{ $group: { _id: "$teamId", n: { $sum: 1 } } }]);
  const map = new Map(counts.map((c: any) => [String(c._id), c.n]));
  res.json({ teams: teams.map((t) => ({ id: String(t._id), name: t.name, owner: t.ownerId?.email, ownerPlan: t.ownerId?.plan, members: map.get(String(t._id)) || 0, createdAt: t.createdAt })) });
});

adminRouter.get("/referrals", async (_req, res) => {
  const items = await Referral.find().sort({ createdAt: -1 }).limit(200).populate("referrerId", "email").populate("refereeId", "email emailVerified").lean<any[]>();
  res.json({
    referrals: items.map((r) => ({ id: String(r._id), referrer: r.referrerId?.email, referee: r.refereeId?.email, verified: r.refereeId?.emailVerified, status: r.status, rejectReason: r.rejectReason, createdAt: r.createdAt }))
  });
});

adminRouter.post("/referrals/:id/status", async (req, res) => {
  const input = body(req, z.object({ status: z.enum(["qualified", "rejected"]), reason: z.string().max(200).optional() }));
  const ref = await Referral.findOneAndUpdate(
    { _id: parse(objectId, String(req.params.id)), status: { $ne: input.status } },
    { $set: { status: input.status, rejectReason: input.status === "rejected" ? input.reason || "admin" : null, qualifiedAt: input.status === "qualified" ? new Date() : null } },
    { new: true }
  ).lean<any>();
  if (!ref) throw notFound("referral_not_found");
  if (input.status === "qualified") {
    const { processRewards } = await import("../services/referrals.js");
    await processRewards(ref.referrerId);
  }
  await audit(req, "admin.referral_updated", { targetType: "referral", targetId: ref._id, meta: input });
  res.json({ ok: true });
});

adminRouter.get("/audit-logs", async (req, res) => {
  const q = parse(z.object({ page: z.coerce.number().int().min(1).default(1), action: z.string().max(80).optional() }), req.query);
  const filter = q.action ? { action: { $regex: `^${escapeRegex(q.action)}` } } : {};
  const items = await AuditLog.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * 50).limit(50).populate("actorId", "email").lean<any[]>();
  res.json({ logs: items.map((l) => ({ id: String(l._id), actor: l.actorId?.email || "system", action: l.action, targetType: l.targetType, targetId: l.targetId, meta: l.meta, createdAt: l.createdAt })) });
});
