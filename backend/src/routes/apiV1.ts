import express, { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { ApiKey, ApiUsage, UploadedFile, User } from "../models/index.js";
import { sha256 } from "../lib/crypto.js";
import { AppError, badRequest, forbidden, notFound, unauthorized } from "../lib/errors.js";
import { parse, objectId } from "../lib/validate.js";
import { getAiSettings, getPlan } from "../services/settings.js";
import { runCompletion, resolveModel } from "../services/ai/engine.js";
import { buildSystemPrompt, detectLanguage } from "../services/ai/prompt.js";
import { getBalanceView } from "../services/tokens.js";
import { multerLimits, presentFile, processUpload } from "../services/uploads.js";
import { messageToModel } from "../services/chat.js";
import type { ChatMessage } from "../services/ai/providerManager.js";
import { env } from "../config/env.js";

export const apiV1Router = Router();

async function apiAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.get("authorization") || "";
  const m = header.match(/^Bearer\s+(obs_live_[A-Za-z0-9]+)$/);
  if (!m) return next(unauthorized("invalid_api_key", "Provide your API key as: Authorization: Bearer obs_live_..."));
  const key = await ApiKey.findOne({ keyHash: sha256(m[1]!), revokedAt: null }).lean<any>();
  if (!key) return next(unauthorized("invalid_api_key", "The API key is invalid or revoked"));
  const user = await User.findById(key.userId);
  if (!user || user.status !== "active" || !user.emailVerified) return next(forbidden("account_inactive", "The account owning this key is not active"));
  const plan = await getPlan(user.plan);
  if (!plan.apiAccess) return next(forbidden("plan_upgrade_required", "API access requires the Pro or Premium plan"));
  req.user = user;
  req.apiKey = { ...key, plan };
  next();
}

function usageLogger(req: Request, res: Response, next: NextFunction) {
  const started = Date.now();
  res.on("finish", () => {
    if (!req.apiKey) return;
    void ApiUsage.create({
      userId: req.user._id,
      apiKeyId: req.apiKey._id,
      endpoint: req.originalUrl.split("?")[0]!.slice(0, 200),
      method: req.method,
      status: res.statusCode,
      tokens: (res.locals.tokens as number) || 0,
      latencyMs: Date.now() - started,
      errorCode: (res.locals.errorCode as string) || null
    }).catch(() => undefined);
    void ApiKey.updateOne({ _id: req.apiKey._id }, { $set: { lastUsedAt: new Date() }, $inc: { requestCount: 1 } }).exec();
  });
  next();
}

const keyLimiter = rateLimit({
  windowMs: 60_000,
  limit: (req: Request) => req.apiKey?.plan?.apiRequestsPerMinute || 10,
  keyGenerator: (req: Request) => String(req.apiKey?._id),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.locals.errorCode = "rate_limited";
    res.status(429).json({ error: { code: "rate_limited", message: "Rate limit exceeded for this API key" } });
  }
});

apiV1Router.use(express.json({ limit: "2mb" }));
apiV1Router.use(apiAuth, usageLogger, keyLimiter);

const contentPart = z.union([
  z.object({ type: z.literal("text"), text: z.string().max(200_000) }),
  z.object({ type: z.literal("image_url"), image_url: z.object({ url: z.string().max(15_000_000) }) })
]);

const chatSchema = z.object({
  model: z.string().max(200).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.union([z.string().max(200_000), z.array(contentPart).max(20)])
      })
    )
    .min(1)
    .max(200),
  stream: z.boolean().default(false),
  max_tokens: z.number().int().min(1).max(32_000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  file_ids: z.array(objectId).max(10).default([])
});

async function chatHandler(req: Request, res: Response) {
  const input = parse(chatSchema, req.body);
  const settings = await getAiSettings();
  const { model } = await resolveModel(input.model);
  const hasImages = input.messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image_url"));
  if (hasImages && !settings.capabilities.vision) throw new AppError(422, "vision_not_supported", "The selected model does not support images");
  const userSystem = input.messages.filter((m) => m.role === "system").map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");
  const convo = input.messages.filter((m) => m.role !== "system") as ChatMessage[];
  const lastUser = [...convo].reverse().find((m) => m.role === "user");
  const lastText = typeof lastUser?.content === "string" ? lastUser.content : (lastUser?.content as any[])?.find((p) => p.type === "text")?.text || "";
  const system = buildSystemPrompt(settings, {
    userLanguage: (detectLanguage(lastText) as any) || "auto",
    mode: "api",
    extra: userSystem ? `Developer instructions:\n${userSystem}` : undefined
  });
  if (input.file_ids.length && lastUser) {
    const files = await UploadedFile.find({ _id: { $in: input.file_ids }, userId: req.user._id }).lean<any[]>();
    if (files.length !== new Set(input.file_ids).size) throw notFound("file_not_found", "One or more file_ids were not found");
    const enriched = await messageToModel(
      { role: "user", content: lastText, attachments: files.map((f) => ({ fileId: f._id, kind: f.kind })) },
      req.user._id,
      settings
    );
    convo[convo.lastIndexOf(lastUser)] = enriched;
  }
  const messages: ChatMessage[] = [{ role: "system", content: system }, ...convo];
  const id = `chatcmpl_obs_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const created = Math.floor(Date.now() / 1000);

  if (!input.stream) {
    try {
      const out = await runCompletion({ userId: req.user._id, messages, model, maxOutputTokens: input.max_tokens, temperature: input.temperature, feature: "api_chat", via: "api", refId: id });
      res.locals.tokens = out.usage.totalTokens;
      res.json({
        id,
        object: "chat.completion",
        created,
        model: out.result.model,
        choices: [{ index: 0, message: { role: "assistant", content: out.result.content }, finish_reason: out.result.finishReason || "stop" }],
        usage: { prompt_tokens: out.usage.promptTokens, completion_tokens: out.usage.completionTokens, total_tokens: out.usage.totalTokens, estimated: out.usage.estimated },
        obsydia: { remaining_tokens: out.balance?.remaining ?? null }
      });
    } catch (err) {
      res.locals.errorCode = (err as AppError).code;
      throw err;
    }
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const controller = new AbortController();
  let done = false;
  res.on("close", () => {
    if (!done) controller.abort();
  });
  const write = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  try {
    const out = await runCompletion({
      userId: req.user._id,
      messages,
      model,
      maxOutputTokens: input.max_tokens,
      temperature: input.temperature,
      feature: "api_chat",
      via: "api",
      refId: id,
      signal: controller.signal,
      onDelta: (t) => write({ id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: { content: t }, finish_reason: null }] })
    });
    res.locals.tokens = out.usage.totalTokens;
    write({
      id,
      object: "chat.completion.chunk",
      created,
      model: out.result.model,
      choices: [{ index: 0, delta: {}, finish_reason: out.result.finishReason || "stop" }],
      usage: { prompt_tokens: out.usage.promptTokens, completion_tokens: out.usage.completionTokens, total_tokens: out.usage.totalTokens, estimated: out.usage.estimated }
    });
    res.write("data: [DONE]\n\n");
  } catch (err) {
    const e = err as AppError;
    res.locals.errorCode = e.code;
    if (e.code !== "aborted") write({ error: { code: e.code || "internal_error", message: e.message } });
  } finally {
    done = true;
    res.end();
  }
}

apiV1Router.post("/chat", chatHandler);
apiV1Router.post("/chat/completions", chatHandler);

apiV1Router.get("/models", async (_req, res) => {
  const s = await getAiSettings();
  res.json({
    object: "list",
    data: s.models.map((id) => ({
      id,
      object: "model",
      owned_by: env().AI_PROVIDER,
      default: id === s.model,
      capabilities: { streaming: true, vision: s.capabilities.vision, audio: s.capabilities.audio, tools: s.capabilities.tools }
    }))
  });
});

apiV1Router.get("/usage", async (req, res) => {
  const balance = await getBalanceView(req.user._id);
  const since = new Date(Date.now() - 30 * 86400_000);
  const agg = await ApiUsage.aggregate([
    { $match: { userId: req.user._id, createdAt: { $gte: since } } },
    { $group: { _id: null, requests: { $sum: 1 }, tokens: { $sum: "$tokens" } } }
  ]);
  res.json({
    plan: req.user.plan,
    tokens: { total: balance.total, used: balance.used, remaining: balance.remaining, bonus: balance.bonus, reset_at: balance.resetAt },
    api: { requests_30d: agg[0]?.requests || 0, tokens_30d: agg[0]?.tokens || 0, rate_limit_per_minute: req.apiKey.plan.apiRequestsPerMinute }
  });
});

apiV1Router.post("/files", (req, res, next) => multerLimits().single("file")(req, res, next), async (req, res) => {
  if (!req.file) throw badRequest("file_required", "Send the file as multipart/form-data field \"file\"");
  const doc = await processUpload(req.user, req.file, "api", ["image", "document", "code", "zip"]);
  res.status(201).json({ object: "file", ...presentFile(doc) });
});

apiV1Router.get("/files", async (req, res) => {
  const files = await UploadedFile.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100).lean<any[]>();
  res.json({ object: "list", data: files.map((f) => ({ object: "file", ...presentFile(f) })) });
});

apiV1Router.get("/files/:id", async (req, res) => {
  const f = await UploadedFile.findOne({ _id: parse(objectId, String(req.params.id)), userId: req.user._id }).lean<any>();
  if (!f) throw notFound("file_not_found");
  res.json({ object: "file", ...presentFile(f) });
});

apiV1Router.delete("/files/:id", async (req, res) => {
  const f = await UploadedFile.findOneAndDelete({ _id: parse(objectId, String(req.params.id)), userId: req.user._id }).lean<any>();
  if (!f) throw notFound("file_not_found");
  const { dataDir } = await import("../lib/storage.js");
  const fs = await import("node:fs");
  fs.rmSync(dataDir(f.storagePath), { force: true });
  res.json({ object: "file", id: String(f._id), deleted: true });
});
