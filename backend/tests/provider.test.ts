import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { resetEnvCache } from "../src/config/env.js";
import { ProviderManager, classifyError, parseRetryAfter } from "../src/services/ai/providerManager.js";
import { startMockProvider, type MockProvider } from "./helpers/mockProvider.js";

let mock: MockProvider;

beforeAll(async () => {
  mongoose.set("bufferCommands", false);
  mock = await startMockProvider();
  process.env.AI_BASE_URL = mock.url;
});

afterAll(async () => {
  await mock.close();
  mongoose.set("bufferCommands", true);
});

function manager(keys: string[]) {
  process.env.AI_API_KEYS = JSON.stringify(keys);
  resetEnvCache();
  return new ProviderManager();
}

beforeEach(() => {
  mock.requests.length = 0;
  mock.behaviors.clear();
  mock.rejectStreamOptions = false;
  mock.rejectThinking = false;
});

describe("AI provider manager", () => {
  it("rotates keys round-robin", async () => {
    const pm = manager(["K1", "K2", "K3"]);
    for (let i = 0; i < 6; i++) await pm.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(mock.requests.map((r) => r.key)).toEqual(["K1", "K2", "K3", "K1", "K2", "K3"]);
  });

  it("supports an arbitrary number of keys", async () => {
    const keys = Array.from({ length: 40 }, (_, i) => `KEY${i}`);
    const pm = manager(keys);
    await pm.refresh(true);
    expect(pm.list()).toHaveLength(40);
    expect(pm.list().every((k) => !("secret" in k))).toBe(true);
  });

  it("respects Retry-After on 429 and falls back to another authorized key", async () => {
    const pm = manager(["A", "B"]);
    mock.behaviors.set("A", { type: "rate_limit", retryAfter: "120" });
    const r = await pm.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(r.content).toBe("Echo: hi");
    const a = pm.list().find((k) => k.label === "ENV key 1")!;
    expect(a.cooldownUntil - Date.now()).toBeGreaterThan(110_000);
    expect(a.rateLimited).toBe(1);
    mock.requests.length = 0;
    await pm.chat({ messages: [{ role: "user", content: "again" }] });
    await pm.chat({ messages: [{ role: "user", content: "again" }] });
    expect(mock.requests.every((r) => r.key === "B")).toBe(true);
  });

  it("does not retry keys that are cooling down and reports unavailability", async () => {
    const pm = manager(["A"]);
    mock.behaviors.set("A", { type: "rate_limit", retryAfter: "60" });
    await expect(pm.chat({ messages: [{ role: "user", content: "x" }] })).rejects.toMatchObject({ status: 429 });
    const before = mock.requests.length;
    await expect(pm.chat({ messages: [{ role: "user", content: "x" }] })).rejects.toMatchObject({ code: "provider_unavailable", status: 503 });
    expect(mock.requests.length).toBe(before);
  });

  it("fails over on invalid keys and server errors", async () => {
    const pm = manager(["BAD", "DOWN", "GOOD"]);
    mock.behaviors.set("BAD", { type: "unauthorized" });
    mock.behaviors.set("DOWN", { type: "server_error" });
    const r = await pm.chat({ messages: [{ role: "user", content: "x" }] });
    expect(r.keyFingerprint).toBe(pm.list().find((k) => k.label === "ENV key 3")!.fingerprint);
    expect(r.attempts).toBeGreaterThanOrEqual(2);
    expect(mock.requests.at(-1)!.key).toBe("GOOD");
  });

  it("does not retry client errors", async () => {
    const pm = manager(["A", "B"]);
    mock.behaviors.set("A", { type: "bad_request", message: "invalid value for temperature" });
    await expect(pm.chat({ messages: [{ role: "user", content: "x" }] })).rejects.toMatchObject({ code: "provider_rejected_request" });
    expect(mock.requests).toHaveLength(1);
  });

  it("streams deltas and reports provider usage", async () => {
    const pm = manager(["A"]);
    const chunks: string[] = [];
    const r = await pm.chat({ messages: [{ role: "user", content: "stream me please" }], onDelta: (t) => chunks.push(t) });
    expect(chunks.join("")).toBe("Echo: stream me please");
    expect(chunks.length).toBeGreaterThan(1);
    expect(r.usage?.promptTokens).toBe(50);
  });

  it("adapts when the model rejects stream_options", async () => {
    const pm = manager(["A"]);
    mock.rejectStreamOptions = true;
    const r = await pm.chat({ messages: [{ role: "user", content: "hi" }], onDelta: () => undefined });
    expect(r.content).toBe("Echo: hi");
    expect(r.usage).toBeNull();
  });

  it("times out hanging keys", async () => {
    process.env.AI_TIMEOUT_MS = "300";
    const pm = manager(["H", "OK"]);
    mock.behaviors.set("H", { type: "hang" });
    const r = await pm.chat({ messages: [{ role: "user", content: "x" }] });
    expect(r.content).toBe("Echo: x");
    process.env.AI_TIMEOUT_MS = "5000";
    resetEnvCache();
  });

  it("tests individual keys", async () => {
    const pm = manager(["A", "B"]);
    mock.behaviors.set("B", { type: "unauthorized" });
    await pm.refresh(true);
    const [a, b] = pm.list();
    expect((await pm.testKey(a!.fingerprint)).ok).toBe(true);
    const bad = await pm.testKey(b!.fingerprint);
    expect(bad.ok).toBe(false);
    expect(bad.kind).toBe("auth");
  });

  it("disables DeepSeek thinking by default and adapts if the parameter is refused", async () => {
    const pm = manager(["A"]);
    await pm.chat({ messages: [{ role: "user", content: "x" }] });
    expect(mock.requests.at(-1)!.body.thinking).toEqual({ type: "disabled" });
    mock.rejectThinking = true;
    const r = await pm.chat({ messages: [{ role: "user", content: "y" }], onDelta: () => undefined });
    expect(r.content).toBe("Echo: y");
    expect(mock.requests.at(-1)!.body.thinking).toBeUndefined();
    mock.rejectThinking = false;
  });

  it("parses Retry-After formats", () => {
    expect(parseRetryAfter("5")).toBe(5000);
    expect(parseRetryAfter(new Date(Date.now() + 10_000).toUTCString())).toBeGreaterThan(8000);
    expect(parseRetryAfter("99999")).toBe(30 * 60_000);
    expect(classifyError({ status: 429, headers: { "retry-after": "2" } })).toMatchObject({ kind: "rate_limit", retryAfterMs: 2000 });
  });
});
