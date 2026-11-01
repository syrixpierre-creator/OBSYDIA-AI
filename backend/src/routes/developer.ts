import { Router } from "express";
import { z } from "zod";
import { ApiKey, ApiUsage } from "../models/index.js";
import { requireVerified } from "../middleware/auth.js";
import { body, objectId, parse } from "../lib/validate.js";
import { forbidden, notFound, badRequest } from "../lib/errors.js";
import { randomToken, sha256 } from "../lib/crypto.js";
import { getPlan } from "../services/settings.js";
import { audit } from "../lib/audit.js";

export const developerRouter = Router();
developerRouter.use(requireVerified);

export function generateApiKey() {
  const secret = `obs_live_${randomToken(30).replace(/[-_]/g, "x")}`;
  return { secret, hash: sha256(secret), prefix: secret.slice(0, 13), lastFour: secret.slice(-4) };
}

function present(k: any) {
  return {
    id: String(k._id),
    name: k.name,
    preview: `${k.prefix}…${k.lastFour}`,
    revoked: Boolean(k.revokedAt),
    revokedAt: k.revokedAt,
    lastUsedAt: k.lastUsedAt,
    requestCount: k.requestCount,
    createdAt: k.createdAt
  };
}

async function requireApiPlan(user: any) {
  const plan = await getPlan(user.plan);
  if (!plan.apiAccess) throw forbidden("plan_upgrade_required", "API access requires the Pro or Premium plan");
  return plan;
}

developerRouter.get("/keys", async (req, res) => {
  const plan = await getPlan(req.user.plan);
  const keys = await ApiKey.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean<any[]>();
  res.json({ apiAccess: plan.apiAccess, rateLimitPerMinute: plan.apiRequestsPerMinute, keys: keys.map(present) });
});

developerRouter.post("/keys", async (req, res) => {
  await requireApiPlan(req.user);
  const input = body(req, z.object({ name: z.string().trim().min(1).max(60) }));
  const active = await ApiKey.countDocuments({ userId: req.user._id, revokedAt: null });
  if (active >= 10) throw badRequest("too_many_keys", "You can have at most 10 active keys");
  const k = generateApiKey();
  const doc = await ApiKey.create({ userId: req.user._id, name: input.name, prefix: k.prefix, keyHash: k.hash, lastFour: k.lastFour });
  await audit(req, "api_key.created", { targetType: "api_key", targetId: doc._id });
  res.status(201).json({ key: present(doc), secret: k.secret });
});

developerRouter.post("/keys/:id/regenerate", async (req, res) => {
  await requireApiPlan(req.user);
  const old = await ApiKey.findOne({ _id: parse(objectId, String(req.params.id)), userId: req.user._id, revokedAt: null });
  if (!old) throw notFound("api_key_not_found");
  old.revokedAt = new Date();
  await old.save();
  const k = generateApiKey();
  const doc = await ApiKey.create({ userId: req.user._id, name: old.name, prefix: k.prefix, keyHash: k.hash, lastFour: k.lastFour });
  await audit(req, "api_key.regenerated", { targetType: "api_key", targetId: doc._id });
  res.status(201).json({ key: present(doc), secret: k.secret });
});

developerRouter.delete("/keys/:id", async (req, res) => {
  const r = await ApiKey.updateOne({ _id: parse(objectId, String(req.params.id)), userId: req.user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  if (!r.matchedCount) throw notFound("api_key_not_found");
  await audit(req, "api_key.revoked", { targetType: "api_key", targetId: req.params.id });
  res.json({ ok: true });
});

developerRouter.get("/usage", async (req, res) => {
  const since = new Date(Date.now() - 30 * 86400_000);
  const [recent, errors, daily, totals] = await Promise.all([
    ApiUsage.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50).lean<any[]>(),
    ApiUsage.find({ userId: req.user._id, status: { $gte: 400 } }).sort({ createdAt: -1 }).limit(50).lean<any[]>(),
    ApiUsage.aggregate([
      { $match: { userId: req.user._id, createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, requests: { $sum: 1 }, tokens: { $sum: "$tokens" }, errors: { $sum: { $cond: [{ $gte: ["$status", 400] }, 1, 0] } } } },
      { $sort: { _id: 1 } }
    ]),
    ApiUsage.aggregate([
      { $match: { userId: req.user._id, createdAt: { $gte: since } } },
      { $group: { _id: null, requests: { $sum: 1 }, tokens: { $sum: "$tokens" }, avgLatency: { $avg: "$latencyMs" }, errors: { $sum: { $cond: [{ $gte: ["$status", 400] }, 1, 0] } } } }
    ])
  ]);
  const map = (u: any) => ({ id: String(u._id), endpoint: u.endpoint, method: u.method, status: u.status, tokens: u.tokens, latencyMs: u.latencyMs, errorCode: u.errorCode, createdAt: u.createdAt });
  res.json({
    totals: totals[0] ? { requests: totals[0].requests, tokens: totals[0].tokens, avgLatencyMs: Math.round(totals[0].avgLatency || 0), errors: totals[0].errors } : { requests: 0, tokens: 0, avgLatencyMs: 0, errors: 0 },
    daily: daily.map((d) => ({ day: d._id, requests: d.requests, tokens: d.tokens, errors: d.errors })),
    recent: recent.map(map),
    errors: errors.map(map)
  });
});
