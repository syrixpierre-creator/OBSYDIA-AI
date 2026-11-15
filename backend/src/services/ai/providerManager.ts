import OpenAI from "openai";
import { providerConfig, keyFingerprint } from "../../config/provider.js";
import { decrypt, maskSecret, sha256 } from "../../lib/crypto.js";
import { AppError } from "../../lib/errors.js";
import { logger, scrub } from "../../lib/logger.js";
import { AdminSetting, ProviderKey, ProviderUsage } from "../../models/index.js";

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
  responseFormat?: "json_object";
}

export interface ChatResult {
  content: string;
  model: string;
  finishReason: string | null;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  keyFingerprint: string;
  attempts: number;
}

export interface KeyState {
  fingerprint: string;
  source: "env" | "dashboard";
  id: string | null;
  label: string;
  owner: string;
  masked: string;
  secret: string;
  enabled: boolean;
  cooldownUntil: number;
  consecutiveFailures: number;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  lastError: string | null;
  requests: number;
  successes: number;
  errors: number;
  rateLimited: number;
  promptTokens: number;
  completionTokens: number;
  lastLatencyMs: number | null;
}

type Classified = { kind: "rate_limit" | "auth" | "transient" | "client" | "aborted"; status: number; retryAfterMs: number | null; message: string };

const MAX_COOLDOWN_MS = 30 * 60_000;

export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.min(seconds * 1000, MAX_COOLDOWN_MS));
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, Math.min(date - now, MAX_COOLDOWN_MS));
  return null;
}

function headerValue(headers: unknown, name: string): string | null {
  if (!headers) return null;
  if (typeof (headers as Headers).get === "function") return (headers as Headers).get(name);
  const rec = headers as Record<string, string>;
  return rec[name] ?? rec[name.toLowerCase()] ?? null;
}

export function classifyError(err: unknown): Classified {
  const e = err as any;
  if (e?.name === "AbortError" || e instanceof OpenAI.APIUserAbortError) {
    return { kind: "aborted", status: 499, retryAfterMs: null, message: "aborted" };
  }
  const status: number = typeof e?.status === "number" ? e.status : 0;
  const message = scrub(String(e?.error?.message || e?.message || "Unknown provider error")).slice(0, 300);
  const retryAfterMs =
    parseRetryAfter(headerValue(e?.headers, "retry-after")) ??
    (headerValue(e?.headers, "retry-after-ms") ? Number(headerValue(e?.headers, "retry-after-ms")) : null);
  if (status === 429) return { kind: "rate_limit", status, retryAfterMs, message };
  if (status === 401 || status === 403) return { kind: "auth", status, retryAfterMs: null, message };
  if (status === 408 || status === 409 || status >= 500 || status === 0) return { kind: "transient", status: status || 502, retryAfterMs, message };
  return { kind: "client", status, retryAfterMs: null, message };
}

function day() {
  return new Date().toISOString().slice(0, 10);
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    }, { once: true });
  });

export class ProviderManager {
  private keys = new Map<string, KeyState>();
  private cursor = 0;
  private loadedAt = 0;
  private streamUsageSupported = true;
  private extraBodySupported = true;
  private clientFactory: (apiKey: string) => OpenAI;

  constructor(clientFactory?: (apiKey: string) => OpenAI) {
    this.clientFactory =
      clientFactory ||
      ((apiKey) =>
        new OpenAI({ apiKey, baseURL: providerConfig().baseURL, timeout: providerConfig().timeoutMs, maxRetries: 0 }));
  }

  async refresh(force = false) {
    if (!force && Date.now() - this.loadedAt < 15_000 && this.keys.size) return;
    const next = new Map<string, KeyState>();
    const add = (secret: string, source: KeyState["source"], meta: { id?: string; label: string; owner?: string; enabled: boolean }) => {
      const fingerprint = sha256(keyFingerprint(secret)).slice(0, 16);
      const prev = this.keys.get(fingerprint);
      next.set(fingerprint, {
        fingerprint,
        source,
        id: meta.id ?? null,
        label: meta.label,
        owner: meta.owner ?? "",
        masked: maskSecret(secret),
        secret,
        enabled: meta.enabled,
        cooldownUntil: prev?.cooldownUntil ?? 0,
        consecutiveFailures: prev?.consecutiveFailures ?? 0,
        lastSuccessAt: prev?.lastSuccessAt ?? null,
        lastErrorAt: prev?.lastErrorAt ?? null,
        lastError: prev?.lastError ?? null,
        requests: prev?.requests ?? 0,
        successes: prev?.successes ?? 0,
        errors: prev?.errors ?? 0,
        rateLimited: prev?.rateLimited ?? 0,
        promptTokens: prev?.promptTokens ?? 0,
        completionTokens: prev?.completionTokens ?? 0,
        lastLatencyMs: prev?.lastLatencyMs ?? null
      });
    };
    let disabledEnv: string[] = [];
    try {
      const doc = await AdminSetting.findOne({ key: "provider_disabled_env" }).lean<any>();
      disabledEnv = Array.isArray(doc?.value) ? doc.value : [];
    } catch {}
    const pc = providerConfig();
    pc.keys.forEach((k, i) =>
      add(k, "env", { label: `ENV key ${i + 1}`, enabled: !disabledEnv.includes(sha256(keyFingerprint(k)).slice(0, 16)) })
    );
    try {
      const docs = await ProviderKey.find({ provider: pc.name }).select("+encryptedKey").lean<any[]>();
      for (const d of docs) {
        try {
          add(decrypt(d.encryptedKey), "dashboard", { id: String(d._id), label: d.label, owner: d.owner, enabled: d.enabled });
        } catch {
          logger.error({ keyId: String(d._id) }, "provider key could not be decrypted; check ENCRYPTION_KEY");
        }
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "could not load dashboard provider keys");
    }
    this.keys = next;
    this.loadedAt = Date.now();
  }

  list(): Omit<KeyState, "secret">[] {
    return [...this.keys.values()].map(({ secret: _s, ...rest }) => rest);
  }

  get(fingerprint: string) {
    return this.keys.get(fingerprint);
  }

  availability() {
    const all = [...this.keys.values()];
    const enabled = all.filter((k) => k.enabled);
    const ready = enabled.filter((k) => k.cooldownUntil <= Date.now());
    const nextReadyAt = enabled.length && !ready.length ? Math.min(...enabled.map((k) => k.cooldownUntil)) : null;
    return { total: all.length, enabled: enabled.length, ready: ready.length, nextReadyAt };
  }

  pick(exclude: Set<string> = new Set()): KeyState | null {
    const candidates = [...this.keys.values()].filter((k) => k.enabled && !exclude.has(k.fingerprint) && k.cooldownUntil <= Date.now());
    if (!candidates.length) return null;
    const key = candidates[this.cursor % candidates.length]!;
    this.cursor = (this.cursor + 1) % 1_000_000;
    return key;
  }

  private recordSuccess(k: KeyState, latency: number, usage: ChatResult["usage"]) {
    k.successes++;
    k.consecutiveFailures = 0;
    k.lastSuccessAt = new Date();
    k.lastLatencyMs = latency;
    k.promptTokens += usage?.promptTokens ?? 0;
    k.completionTokens += usage?.completionTokens ?? 0;
    void ProviderUsage.updateOne(
      { keyFingerprint: k.fingerprint, day: day() },
      {
        $inc: { requests: 1, successes: 1, promptTokens: usage?.promptTokens ?? 0, completionTokens: usage?.completionTokens ?? 0 },
        $set: { lastSuccessAt: new Date() }
      },
      { upsert: true }
    ).catch(() => undefined);
  }

  private recordFailure(k: KeyState, c: Classified) {
    k.errors++;
    k.consecutiveFailures++;
    k.lastErrorAt = new Date();
    k.lastError = `${c.status} ${c.message}`;
    if (c.kind === "rate_limit") {
      k.rateLimited++;
      const backoff = Math.min(5000 * 2 ** (k.consecutiveFailures - 1), MAX_COOLDOWN_MS);
      k.cooldownUntil = Date.now() + (c.retryAfterMs ?? backoff);
    } else if (c.kind === "auth") {
      k.cooldownUntil = Date.now() + MAX_COOLDOWN_MS;
    } else if (c.kind === "transient") {
      k.cooldownUntil = Date.now() + (c.retryAfterMs ?? Math.min(1000 * 2 ** (k.consecutiveFailures - 1), 60_000));
    }
    void ProviderUsage.updateOne(
      { keyFingerprint: k.fingerprint, day: day() },
      {
        $inc: { requests: 1, errorCount: 1, rateLimited: c.kind === "rate_limit" ? 1 : 0 },
        $set: { lastErrorAt: new Date(), lastError: k.lastError }
      },
      { upsert: true }
    ).catch(() => undefined);
  }

  resetCooldown(fingerprint: string) {
    const k = this.keys.get(fingerprint);
    if (k) {
      k.cooldownUntil = 0;
      k.consecutiveFailures = 0;
    }
  }

  async chat(req: ChatRequest, opts: { fingerprint?: string } = {}): Promise<ChatResult> {
    await this.refresh();
    if (!this.keys.size) throw new AppError(503, "provider_not_configured", `No ${providerConfig().label} API key is configured`);
    const maxAttempts = Math.max(1, providerConfig().maxRetries + 1);
    const tried = new Set<string>();
    let lastError: Classified | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (req.signal?.aborted) throw new AppError(499, "aborted", "Request cancelled");
      let key = opts.fingerprint ? this.keys.get(opts.fingerprint) ?? null : this.pick(tried);
      if (!key && !opts.fingerprint && tried.size) {
        tried.clear();
        key = this.pick(tried);
      }
      if (!key) {
        const a = this.availability();
        const wait = a.nextReadyAt ? a.nextReadyAt - Date.now() : null;
        if (wait !== null && wait <= 4000 && attempt < maxAttempts) {
          await sleep(Math.max(wait, 250), req.signal);
          continue;
        }
        if (lastError?.kind === "rate_limit") {
          throw new AppError(429, "provider_rate_limited", "The AI provider is rate limiting requests. Please retry shortly.", {
            retryAfterSeconds: wait ? Math.ceil(wait / 1000) : null
          });
        }
        const err = new AppError(503, "provider_unavailable", "All provider keys are temporarily unavailable", {
          retryAfterSeconds: wait ? Math.ceil(wait / 1000) : null
        });
        throw err;
      }
      tried.add(key.fingerprint);
      key.requests++;
      const started = Date.now();
      let emitted = false;
      try {
        const result = await this.execute(key, req, () => {
          emitted = true;
        });
        this.recordSuccess(key, Date.now() - started, result.usage);
        return { ...result, keyFingerprint: key.fingerprint, attempts: attempt };
      } catch (err) {
        const c = classifyError(err);
        if (c.kind === "aborted" || req.signal?.aborted) throw new AppError(499, "aborted", "Request cancelled");
        this.recordFailure(key, c);
        lastError = c;
        logger.warn({ key: key.masked, status: c.status, kind: c.kind, attempt }, "provider request failed");
        if (emitted || c.kind === "client" || opts.fingerprint) break;
        if (c.kind === "transient" && attempt < maxAttempts) {
          await sleep(Math.min(250 * 2 ** (attempt - 1), 4000), req.signal);
        }
      }
    }
    if (lastError?.kind === "client") throw new AppError(400, "provider_rejected_request", lastError.message);
    if (lastError?.kind === "rate_limit") throw new AppError(429, "provider_rate_limited", "The AI provider is rate limiting requests. Please retry shortly.");
    throw new AppError(502, "provider_error", lastError?.message || "The AI provider did not respond");
  }

  private async execute(key: KeyState, req: ChatRequest, onFirstByte: () => void) {
    const client = this.clientFactory(key.secret);
    const pc = providerConfig();
    const model = req.model || pc.model;
    const base: Record<string, unknown> = { model, messages: req.messages };
    if (req.maxTokens) base.max_tokens = pc.maxOutputCap > 0 ? Math.min(req.maxTokens, pc.maxOutputCap) : req.maxTokens;
    const extraKeys = Object.keys(pc.extraBody);
    if (this.extraBodySupported && extraKeys.length) Object.assign(base, pc.extraBody);
    const withExtraFallback = async <T>(fn: (params: Record<string, unknown>) => Promise<T>): Promise<T> => {
      try {
        return await fn(base);
      } catch (err) {
        const c = classifyError(err);
        if (c.kind === "client" && this.extraBodySupported && extraKeys.some((k) => base[k] !== undefined) && (extraKeys.some((k) => c.message.toLowerCase().includes(k.toLowerCase())) || /unknown|unrecognized|unsupported|extra/i.test(c.message))) {
          this.extraBodySupported = false;
          for (const k of extraKeys) delete base[k];
          return await fn(base);
        }
        throw err;
      }
    };
    if (typeof req.temperature === "number") base.temperature = req.temperature;
    if (req.responseFormat) base.response_format = { type: req.responseFormat };

    if (!req.onDelta) {
      const res: any = await withExtraFallback((params) => client.chat.completions.create(params as any, { signal: req.signal }));
      onFirstByte();
      const choice = res.choices?.[0];
      return {
        content: String(choice?.message?.content ?? ""),
        model: res.model || model,
        finishReason: choice?.finish_reason ?? null,
        usage: res.usage
          ? { promptTokens: res.usage.prompt_tokens ?? 0, completionTokens: res.usage.completion_tokens ?? 0, totalTokens: res.usage.total_tokens ?? 0 }
          : null
      };
    }

    const run = async (withUsage: boolean) => {
      const params: any = { ...base, stream: true };
      if (withUsage) params.stream_options = { include_usage: true };
      const stream: any = await client.chat.completions.create(params, { signal: req.signal });
      let content = "";
      let finishReason: string | null = null;
      let usage: ChatResult["usage"] = null;
      let resolvedModel = model;
      for await (const chunk of stream) {
        if (chunk.model) resolvedModel = chunk.model;
        const choice = chunk.choices?.[0];
        const delta = choice?.delta?.content;
        if (delta) {
          onFirstByte();
          content += delta;
          req.onDelta!(delta);
        }
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        if (chunk.usage) {
          usage = {
            promptTokens: chunk.usage.prompt_tokens ?? 0,
            completionTokens: chunk.usage.completion_tokens ?? 0,
            totalTokens: chunk.usage.total_tokens ?? 0
          };
        }
      }
      return { content, model: resolvedModel, finishReason, usage };
    };

    if (this.streamUsageSupported) {
      try {
        return await withExtraFallback(() => run(true));
      } catch (err) {
        const c = classifyError(err);
        if (c.kind === "client" && /stream_options|include_usage/i.test(c.message)) {
          this.streamUsageSupported = false;
          return await withExtraFallback(() => run(false));
        }
        throw err;
      }
    }
    return await withExtraFallback(() => run(false));
  }

  async testKey(fingerprint: string) {
    await this.refresh(true);
    const key = this.keys.get(fingerprint);
    if (!key) throw new AppError(404, "key_not_found");
    const started = Date.now();
    try {
      const client = this.clientFactory(key.secret);
      const res: any = await client.chat.completions.create({
        model: providerConfig().model,
        messages: [{ role: "user", content: "Reply with the single word: ok" }],
        max_tokens: 8,
        ...(this.extraBodySupported ? providerConfig().extraBody : {})
      } as any);
      const latency = Date.now() - started;
      const usage = res.usage
        ? { promptTokens: res.usage.prompt_tokens ?? 0, completionTokens: res.usage.completion_tokens ?? 0, totalTokens: res.usage.total_tokens ?? 0 }
        : null;
      key.requests++;
      this.recordSuccess(key, latency, usage);
      key.cooldownUntil = 0;
      return { ok: true, latencyMs: latency, model: res.model || providerConfig().model, sample: String(res.choices?.[0]?.message?.content ?? "").slice(0, 40) };
    } catch (err) {
      const c = classifyError(err);
      key.requests++;
      this.recordFailure(key, c);
      return { ok: false, latencyMs: Date.now() - started, status: c.status, error: c.message, kind: c.kind };
    }
  }

  async listModels(): Promise<string[] | null> {
    await this.refresh();
    const key = this.pick();
    if (!key) return null;
    try {
      const page: any = await this.clientFactory(key.secret).models.list();
      const ids: string[] = [];
      for await (const m of page) ids.push(m.id);
      return ids;
    } catch {
      return null;
    }
  }
}

export const providerManager = new ProviderManager();
