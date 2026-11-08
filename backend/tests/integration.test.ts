import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import Stripe from "stripe";
import yazl from "yazl";
import type { Express } from "express";
import { resetEnvCache } from "../src/config/env.js";
import { startTestDb, stopTestDb, clearDb } from "./helpers/db.js";
import { startMockProvider, type MockProvider } from "./helpers/mockProvider.js";
import { Client, lastCodeFor, lastLinkFor, parseSse, signup } from "./helpers/app.js";

const uri = await startTestDb();
const d = uri ? describe : describe.skip;

let app: Express;
let mock: MockProvider;
let models: typeof import("../src/models/index.js");
let tokens: typeof import("../src/services/tokens.js");
let pm: typeof import("../src/services/ai/providerManager.js");
let settings: typeof import("../src/services/settings.js");

beforeAll(async () => {
  if (!uri) return;
  mock = await startMockProvider();
  process.env.MONGODB_URI = uri;
  process.env.AI_BASE_URL = mock.url;
  process.env.AI_API_KEYS = '["TESTKEY1","TESTKEY2"]';
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
  process.env.ADMIN_EMAIL = "admin@obsydia.test";
  process.env.ADMIN_PASSWORD = "Admin-Password-2024";
  resetEnvCache();
  const db = await import("../src/lib/db.js");
  await db.connectDb(uri);
  await db.syncIndexes();
  models = await import("../src/models/index.js");
  tokens = await import("../src/services/tokens.js");
  pm = await import("../src/services/ai/providerManager.js");
  settings = await import("../src/services/settings.js");
  const { createApp } = await import("../src/app.js");
  app = createApp();
});

afterAll(async () => {
  if (!uri) return;
  await mock.close();
  await stopTestDb();
});

beforeEach(async () => {
  if (!uri) return;
  await clearDb();
  settings.clearSettingsCache();
  await pm.providerManager.refresh(true);
  for (const k of pm.providerManager.list()) pm.providerManager.resetCooldown(k.fingerprint);
  mock.behaviors.clear();
  mock.requests.length = 0;
});

async function setPlan(userId: string, plan: string) {
  await models.User.updateOne({ _id: userId }, { $set: { plan } });
  await tokens.applyPlanToBalance(userId, plan, true);
}

async function admin() {
  const { ensureInitialAdmin } = await import("../src/services/bootstrap.js");
  await ensureInitialAdmin();
  const c = await new Client(app).init();
  const r = await c.post("/api/auth/login", { email: "admin@obsydia.test", password: "Admin-Password-2024" });
  expect(r.status).toBe(200);
  return c;
}

async function send(c: Client, convId: string, content: string) {
  const res = await c.post(`/api/chat/conversations/${convId}/messages`, { content }).buffer(true).parse((r, cb) => {
    let data = "";
    r.on("data", (x: Buffer) => (data += x.toString()));
    r.on("end", () => cb(null, data));
  });
  return { status: res.status, events: parseSse(res.body as string) };
}

d("authentication", () => {
  it("signs up, verifies by code, logs in and out", async () => {
    const c = await new Client(app).init();
    const r = await c.post("/api/auth/signup", { name: "Ada", email: "ada@example.com", password: "Sup3rSecret-pass" });
    expect(r.status).toBe(201);
    expect(r.body.user.emailVerified).toBe(false);
    expect((await c.get("/api/chat/conversations")).body.error.code).toBe("email_not_verified");
    expect((await c.post("/api/auth/verify-email", { code: "000000" })).status).toBe(400);
    expect((await c.post("/api/auth/verify-email", { code: lastCodeFor("ada@example.com") })).body.user.emailVerified).toBe(true);
    expect((await c.get("/api/chat/conversations")).status).toBe(200);
    await c.post("/api/auth/logout");
    expect((await c.get("/api/auth/me")).body.user).toBeNull();
    expect((await c.post("/api/auth/login", { email: "ada@example.com", password: "wrong-password1" })).status).toBe(401);
    expect((await c.post("/api/auth/login", { email: "ada@example.com", password: "Sup3rSecret-pass" })).status).toBe(200);
  });

  it("stores only password hashes and rejects duplicate gmail aliases", async () => {
    await signup(app, "john.doe@gmail.com");
    const u = await models.User.findOne({ email: "john.doe@gmail.com" }).lean<any>();
    expect(u.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    const c = await new Client(app).init();
    expect((await c.post("/api/auth/signup", { name: "Jo", email: "johndoe+x@gmail.com", password: "Sup3rSecret-pass" })).status).toBe(409);
  });

  it("verifies by email link and resets passwords, revoking sessions", async () => {
    const { client } = await signup(app, "link@example.com", { verify: false });
    const token = lastLinkFor("link@example.com", "verify-email?token=");
    const anon = await new Client(app).init();
    expect((await anon.post("/api/auth/verify-email", { token })).status).toBe(200);
    await anon.post("/api/auth/forgot-password", { email: "link@example.com" });
    const reset = lastLinkFor("link@example.com", "reset-password?token=");
    expect((await anon.post("/api/auth/reset-password", { token: reset, password: "Another-pass-99" })).status).toBe(200);
    expect((await anon.post("/api/auth/reset-password", { token: reset, password: "Another-pass-99" })).status).toBe(400);
    expect((await client.get("/api/auth/me")).body.user).toBeNull();
    expect((await anon.post("/api/auth/login", { email: "link@example.com", password: "Another-pass-99" })).status).toBe(200);
  });

  it("locks accounts after repeated failures and enforces CSRF", async () => {
    await signup(app, "brute@example.com");
    const c = await new Client(app).init();
    for (let i = 0; i < 8; i++) await c.post("/api/auth/login", { email: "brute@example.com", password: "nope-nope-1" });
    const r = await c.post("/api/auth/login", { email: "brute@example.com", password: "Sup3rSecret-pass" });
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe("account_locked");
    const raw = await request(app).post("/api/auth/login").send({ email: "x@example.com", password: "y" });
    expect(raw.status).toBe(403);
    expect(raw.body.error.code).toBe("csrf_failed");
  });

  it("strips NoSQL operators from input", async () => {
    await signup(app, "nosql@example.com");
    const c = await new Client(app).init();
    const r = await c.post("/api/auth/login", { email: { $ne: null }, password: { $ne: null } });
    expect(r.status).toBe(400);
  });
});

d("chat", () => {
  it("streams answers, persists history and charges tokens", async () => {
    const { client } = await signup(app, "chat@example.com");
    const before = (await client.get("/api/tokens")).body.balance;
    expect(before.total).toBe(25000);
    const conv = (await client.post("/api/chat/conversations", {})).body.conversation;
    const r = await send(client, conv.id, "hello there");
    expect(r.events.map((e) => e.event)).toEqual(expect.arrayContaining(["start", "delta", "done"]));
    expect(r.events.filter((e) => e.event === "delta").map((e) => e.data.text).join("")).toBe("Echo: hello there");
    const done = r.events.find((e) => e.event === "done")!.data;
    expect(done.usage.estimated).toBe(false);
    const after = (await client.get("/api/tokens")).body.balance;
    expect(after.used).toBe(done.usage.totalTokens);
    expect(after.reserved).toBe(0);
    const full = (await client.get(`/api/chat/conversations/${conv.id}`)).body;
    expect(full.conversation.title).toBe("hello there");
    expect(full.messages.map((m: any) => m.role)).toEqual(["user", "assistant"]);
    expect((await client.get("/api/tokens/history")).body.items.some((t: any) => t.type === "usage")).toBe(true);
  });

  it("answers the creator question with the configured identity", async () => {
    const { client } = await signup(app, "who@example.com");
    const conv = (await client.post("/api/chat/conversations", {})).body.conversation;
    const r = await send(client, conv.id, "Who created you?");
    const text = r.events.filter((e) => e.event === "delta").map((e) => e.data.text).join("");
    expect(text).toBe("I was created by Inconnu Boy Sensei, the developer and founder of OBSYDIA AI.");
    expect(mock.requests.at(-1)!.body.messages[0].content).toContain("your name is OBSYDIA");
  });

  it("regenerates, edits, pins, searches and isolates users", async () => {
    const { client } = await signup(app, "multi@example.com");
    const { client: other } = await signup(app, "other@example.com");
    const conv = (await client.post("/api/chat/conversations", {})).body.conversation;
    await send(client, conv.id, "first question about rockets");
    let msgs = (await client.get(`/api/chat/conversations/${conv.id}`)).body.messages;
    const assistantId = msgs[1].id;
    const regen = await client.post(`/api/chat/messages/${assistantId}/regenerate`, {}).buffer(true).parse((r, cb) => {
      let s = "";
      r.on("data", (x: Buffer) => (s += x));
      r.on("end", () => cb(null, s));
    });
    expect(parseSse(regen.body as string).some((e) => e.event === "done")).toBe(true);
    msgs = (await client.get(`/api/chat/conversations/${conv.id}`)).body.messages;
    expect(msgs).toHaveLength(2);
    await client.post(`/api/chat/messages/${msgs[0].id}/edit`, { content: "edited question" }).buffer(true).parse((r, cb) => {
      r.on("data", () => undefined);
      r.on("end", () => cb(null, ""));
    });
    msgs = (await client.get(`/api/chat/conversations/${conv.id}`)).body.messages;
    expect(msgs[0].content).toBe("edited question");
    expect(msgs[1].content).toBe("Echo: edited question");
    expect((await client.post(`/api/chat/conversations/${conv.id}/pin`)).body.pinned).toBe(true);
    await client.post("/api/auth/logout");
    await client.post("/api/auth/login", { email: "multi@example.com", password: "Sup3rSecret-pass" });
    const list = (await client.get("/api/chat/conversations")).body;
    expect(list.pinned.map((c: any) => c.id)).toEqual([conv.id]);
    const search = (await client.get("/api/chat/search?q=edited")).body;
    expect(search.messages.length).toBeGreaterThan(0);
    expect((await other.get(`/api/chat/conversations/${conv.id}`)).status).toBe(404);
    expect((await other.post(`/api/chat/conversations/${conv.id}/pin`)).status).toBe(404);
    expect((await other.get("/api/chat/search?q=edited")).body.messages).toHaveLength(0);
  });

  it("refuses requests when the balance is insufficient", async () => {
    const { client, user } = await signup(app, "poor@example.com");
    await tokens.ensureBalance(user.id);
    await models.TokenBalance.updateOne({ userId: user.id }, { $set: { used: 24990 } });
    const conv = (await client.post("/api/chat/conversations", {})).body.conversation;
    const r = await send(client, conv.id, "hi");
    const err = r.events.find((e) => e.event === "error")!;
    expect(err.data.code).toBe("insufficient_tokens");
  });

  it("surfaces provider outages without charging tokens", async () => {
    const { client } = await signup(app, "outage@example.com");
    mock.behaviors.set("TESTKEY1", { type: "server_error" });
    mock.behaviors.set("TESTKEY2", { type: "server_error" });
    const conv = (await client.post("/api/chat/conversations", {})).body.conversation;
    const r = await send(client, conv.id, "hi");
    expect(r.events.find((e) => e.event === "error")).toBeTruthy();
    expect((await client.get("/api/tokens")).body.balance.used).toBe(0);
  });
});

d("token accounting", () => {
  it("prevents concurrent overspending", async () => {
    const { user } = await signup(app, "race@example.com");
    await tokens.ensureBalance(user.id);
    await models.TokenBalance.updateOne({ userId: user.id }, { $set: { used: 23000 } });
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => tokens.reserveTokens(user.id, 100, 500)));
    const ok = results.filter((r) => r.status === "fulfilled").map((r: any) => r.value);
    const sum = ok.reduce((s, r) => s + r.amount, 0);
    expect(sum).toBeLessThanOrEqual(2000);
    expect(ok.length).toBe(3);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(9);
    const b = await tokens.getBalanceView(user.id);
    expect(b.reserved).toBe(sum);
    for (const r of ok) await tokens.releaseReservation(r);
    expect((await tokens.getBalanceView(user.id)).reserved).toBe(0);
  });

  it("resets allowances only when the period ends and keeps referral bonuses", async () => {
    const { user } = await signup(app, "reset@example.com");
    await tokens.ensureBalance(user.id);
    await tokens.grantBonus(user.id, 10000, "referral_bonus", "test");
    await models.TokenBalance.updateOne({ userId: user.id }, { $set: { used: 25000 } });
    let b = await tokens.getBalanceView(user.id);
    expect(b.remaining).toBe(10000);
    await models.TokenBalance.updateOne({ userId: user.id }, { $set: { resetAt: new Date(Date.now() - 1000) } });
    b = await tokens.getBalanceView(user.id);
    expect(b.used).toBe(0);
    expect(b.bonus).toBe(10000);
    expect(b.remaining).toBe(35000);
    expect(new Date(b.resetAt).getTime() - Date.now()).toBeGreaterThan(167 * 3600_000);
  });

  it("spends allowance first, then bonus", async () => {
    const { user } = await signup(app, "spend@example.com");
    await tokens.ensureBalance(user.id);
    await tokens.grantBonus(user.id, 1000, "referral_bonus", "t");
    await models.TokenBalance.updateOne({ userId: user.id }, { $set: { used: 24800 } });
    const r = await tokens.reserveTokens(user.id, 100, 600);
    await tokens.settleReservation(r, { promptTokens: 100, completionTokens: 400, estimated: false, feature: "chat", via: "app" });
    const b = await tokens.getBalanceView(user.id);
    expect(b.used).toBe(25000);
    expect(b.bonus).toBe(700);
  });
});

d("referrals", () => {
  it("credits 10,000 tokens per 5 verified referrals exactly once", async () => {
    const { client: ref, user } = await signup(app, "referrer@example.com");
    await models.User.updateOne({ _id: user.id }, { $set: { signupIpHash: "referrer-network" } });
    for (let i = 0; i < 4; i++) {
      await signup(app, `friend${i}@example.com`, { ref: user.referralCode });
      await models.User.updateOne({ email: `friend${i}@example.com` }, { $set: { signupIpHash: `friend-network-${i}` } });
    }
    let s = (await ref.get("/api/referrals")).body;
    expect(s.qualified).toBe(4);
    expect(s.earnedTokens).toBe(0);
    const fifth = await signup(app, "friend4@example.com", { ref: user.referralCode, verify: false });
    s = (await ref.get("/api/referrals")).body;
    expect(s.pending).toBe(1);
    expect((await ref.get("/api/tokens")).body.balance.bonus).toBe(0);
    await fifth.client.post("/api/auth/verify-email", { code: lastCodeFor("friend4@example.com") });
    s = (await ref.get("/api/referrals")).body;
    expect(s.qualified).toBe(5);
    expect(s.earnedTokens).toBe(10000);
    const { processRewards } = await import("../src/services/referrals.js");
    await Promise.all([processRewards(user.id), processRewards(user.id), processRewards(user.id)]);
    expect(await models.ReferralReward.countDocuments({ userId: user.id })).toBe(1);
    expect((await ref.get("/api/tokens")).body.balance.bonus).toBe(10000);
    const rewardTx = await models.TokenTransaction.countDocuments({ userId: user.id, type: "referral_bonus" });
    expect(rewardTx).toBe(1);
  });

  it("rejects same-network referrals and duplicate alias accounts", async () => {
    const { user } = await signup(app, "self@example.com");
    await signup(app, "someone.else@example.com", { ref: user.referralCode });
    const r = await models.Referral.findOne({}).lean<any>();
    expect(r.status).toBe("rejected");
    expect(r.rejectReason).toBe("same_network_as_referrer");
    const c = await new Client(app).init();
    const dup = await c.post("/api/auth/signup", { name: "Alias", email: "self+alt@example.com", password: "Sup3rSecret-pass", ref: user.referralCode });
    expect(dup.status).toBe(409);
  });
});

d("developer API", () => {
  it("requires a paid plan, issues hashed keys and serves /api/v1", async () => {
    const { client, user } = await signup(app, "dev@example.com");
    expect((await client.post("/api/developer/keys", { name: "k" })).status).toBe(403);
    await setPlan(user.id, "pro");
    const created = await client.post("/api/developer/keys", { name: "server" });
    expect(created.status).toBe(201);
    const secret: string = created.body.secret;
    expect(secret).toMatch(/^obs_live_/);
    const stored = await models.ApiKey.findOne({}).lean<any>();
    expect(stored.keyHash).not.toContain(secret);
    expect(JSON.stringify((await client.get("/api/developer/keys")).body)).not.toContain(secret);

    const chat = await request(app).post("/api/v1/chat").set("authorization", `Bearer ${secret}`).send({ messages: [{ role: "user", content: "ping" }] });
    expect(chat.status).toBe(200);
    expect(chat.body.choices[0].message.content).toBe("Echo: ping");
    expect(chat.body.usage.total_tokens).toBeGreaterThan(0);

    const stream = await request(app)
      .post("/api/v1/chat")
      .set("authorization", `Bearer ${secret}`)
      .send({ stream: true, messages: [{ role: "user", content: "s" }] })
      .buffer(true)
      .parse((r, cb) => {
        let s = "";
        r.on("data", (x: Buffer) => (s += x));
        r.on("end", () => cb(null, s));
      });
    expect(String(stream.body)).toContain("data: [DONE]");

    const models_ = await request(app).get("/api/v1/models").set("authorization", `Bearer ${secret}`);
    expect(models_.body.data[0].id).toBe("deepseek-v4-flash");
    const usage = await request(app).get("/api/v1/usage").set("authorization", `Bearer ${secret}`);
    expect(usage.body.plan).toBe("pro");
    expect(usage.body.tokens.total).toBe(60000);

    const file = await request(app).post("/api/v1/files").set("authorization", `Bearer ${secret}`).attach("file", Buffer.from("hello doc"), "notes.txt");
    expect(file.status).toBe(201);
    const withFile = await request(app).post("/api/v1/chat").set("authorization", `Bearer ${secret}`).send({ file_ids: [file.body.id], messages: [{ role: "user", content: "summarize" }] });
    expect(withFile.body.choices[0].message.content).toContain("hello doc");

    expect((await request(app).get("/api/v1/models").set("authorization", "Bearer obs_live_invalid")).status).toBe(401);
    await client.delete(`/api/developer/keys/${created.body.key.id}`);
    expect((await request(app).get("/api/v1/models").set("authorization", `Bearer ${secret}`)).status).toBe(401);
    const logged = (await client.get("/api/developer/usage")).body;
    expect(logged.totals.requests).toBeGreaterThanOrEqual(4);
  });
});

d("teams", () => {
  it("enforces the 3-invite limit, email binding and permissions", async () => {
    const { client: owner, user } = await signup(app, "owner@example.com");
    expect((await owner.post("/api/teams", { name: "Core" })).status).toBe(403);
    await setPlan(user.id, "premium");
    expect((await owner.post("/api/teams", { name: "Core" })).status).toBe(201);
    for (const e of ["m1@example.com", "m2@example.com", "m3@example.com"]) expect((await owner.post("/api/teams/invitations", { email: e, role: "viewer" })).status).toBe(201);
    expect((await owner.post("/api/teams/invitations", { email: "m4@example.com" })).status).toBe(403);
    const token = lastLinkFor("m1@example.com", "/invite/");
    const { client: stranger } = await signup(app, "stranger@example.com");
    expect((await stranger.post(`/api/teams/invitations/${token}/accept`)).status).toBe(403);
    const { client: m1 } = await signup(app, "m1@example.com");
    expect((await m1.post(`/api/teams/invitations/${token}/accept`)).status).toBe(200);
    expect((await m1.post(`/api/teams/invitations/${token}/accept`)).status).toBe(404);
    const project = (await owner.post("/api/projects", { name: "Shared site" })).body.project;
    await owner.put(`/api/projects/${project.id}/file`, { path: "index.html", content: "<h1>x</h1>" });
    expect((await m1.get(`/api/projects/${project.id}`)).status).toBe(404);
    await owner.patch(`/api/projects/${project.id}`, { shareWithTeam: true });
    expect((await m1.get(`/api/projects/${project.id}`)).status).toBe(200);
    expect((await m1.put(`/api/projects/${project.id}/file`, { path: "a.txt", content: "x" })).status).toBe(403);
    expect((await stranger.get(`/api/projects/${project.id}`)).status).toBe(404);
  });
});

async function waitFor(client: Client, id: string) {
  for (let i = 0; i < 100; i++) {
    const p = (await client.get(`/api/projects/${id}`)).body;
    if (!p.project.running && (p.project.status === "ready" || p.project.status === "error")) return p;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("timeout");
}

d("projects, artifacts and previews", () => {
  it("generates, packages, downloads, previews, edits and restores", async () => {
    const { client } = await signup(app, "builder@example.com");
    const { client: other } = await signup(app, "intruder@example.com");
    const g = await client.post("/api/projects/generate", { prompt: "Build a todo app with a dark theme" });
    expect(g.status).toBe(202);
    let p = await waitFor(client, g.body.project.id);
    expect(p.project.status).toBe("ready");
    expect(p.project.name).toBe("Todo Studio");
    expect(p.files.map((f: any) => f.path).sort()).toEqual(["README.md", "app.js", "index.html", "styles.css"]);
    expect(p.project.validation.ok).toBe(true);
    expect(p.versions[0].version).toBe(1);
    expect(p.project.previewable).toBe(true);

    const link = (await client.post(`/api/projects/${p.project.id}/versions/1/link`)).body.url;
    const zip = await client.get(link).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(zip.status).toBe(200);
    expect((zip.body as Buffer).subarray(0, 2).toString()).toBe("PK");
    expect((await other.get(link)).status).toBe(403);
    expect((await other.get(`/api/projects/${p.project.id}`)).status).toBe(404);

    const preview = (await client.post(`/api/projects/${p.project.id}/preview-link`)).body.url as string;
    const path = new URL(preview).pathname;
    const html = await request(app).get(path);
    expect(html.status).toBe(200);
    expect(html.text).toContain("Todo Studio");
    expect(html.headers["content-security-policy"]).toMatch(/^sandbox allow-scripts/);
    const css = await request(app).get(path.replace("index.html", "styles.css"));
    expect(css.headers["content-type"]).toContain("text/css");
    expect((await request(app).get("/preview/forged.token/index.html")).status).toBe(410);

    expect((await client.post(`/api/projects/${p.project.id}/edit`, { instruction: "Change the background to black and add an about page" })).status).toBe(202);
    p = await waitFor(client, p.project.id);
    expect(p.files.map((f: any) => f.path)).toContain("about.html");
    expect(p.versions[0].version).toBe(2);
    const css2 = (await client.get(`/api/projects/${p.project.id}/file?path=styles.css`)).body.content;
    expect(css2).toContain("#08090D");

    await client.post(`/api/projects/${p.project.id}/versions/1/restore`);
    p = (await client.get(`/api/projects/${p.project.id}`)).body;
    expect(p.files.map((f: any) => f.path)).not.toContain("about.html");
    expect(p.versions[0].version).toBe(3);
    expect((await client.put(`/api/projects/${p.project.id}/file`, { path: ".env", content: "SECRET=1" })).status).toBe(400);
    expect((await client.put(`/api/projects/${p.project.id}/file`, { path: "../x", content: "1" })).status).toBe(400);
  });
});

d("uploads", () => {
  it("validates types, plans and archives", async () => {
    const { client, user } = await signup(app, "up@example.com");
    const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(64)]);
    expect((await client.upload("/api/files", "file", png, "a.png")).body.file.kind).toBe("image");
    expect((await client.upload("/api/files", "file", Buffer.from("plain notes"), "n.txt")).body.file.kind).toBe("document");
    expect((await client.upload("/api/files", "file", Buffer.from("MZ\x90\x00\x00binary"), "x.exe")).status).toBe(400);
    const z = new yazl.ZipFile();
    z.addBuffer(Buffer.from("<h1>x</h1>"), "site/index.html");
    z.end();
    const chunks: Buffer[] = [];
    for await (const c of z.outputStream) chunks.push(c as Buffer);
    const zipBuf = Buffer.concat(chunks);
    expect((await client.upload("/api/files", "file", zipBuf, "site.zip")).status).toBe(403);
    await setPlan(user.id, "pro");
    const up = await client.upload("/api/files", "file", zipBuf, "site.zip");
    expect(up.status).toBe(201);
    expect(up.body.file.analysis.tree).toEqual(["index.html"]);
    const imp = await client.post(`/api/files/${up.body.file.id}/import-project`, {});
    expect(imp.status).toBe(201);
    const { client: other } = await signup(app, "up2@example.com");
    expect((await other.get(`/api/files/${up.body.file.id}/content`)).status).toBe(404);
  });
});

d("admin", () => {
  it("restricts access and manages keys, AI identity, users and promos", async () => {
    const { client: user, user: u } = await signup(app, "plain@example.com");
    expect((await user.get("/api/admin/stats")).status).toBe(403);
    const a = await admin();
    expect((await a.get("/api/admin/stats")).body.users.total).toBe(2);

    const add = await a.post("/api/admin/provider-keys", { label: "Friend key", owner: "Friend", key: "xk-friend-key-123456789", test: true });
    expect(add.status).toBe(201);
    expect(add.body.test.ok).toBe(true);
    const stored = await models.ProviderKey.findOne({}).select("+encryptedKey").lean<any>();
    expect(stored.encryptedKey).not.toContain("xk-friend-key");
    const keys = (await a.get("/api/admin/provider-keys")).body.keys;
    expect(keys).toHaveLength(3);
    expect(JSON.stringify(keys)).not.toContain("xk-friend-key-123456789");
    const envKey = keys.find((k: any) => k.source === "env");
    await a.patch(`/api/admin/provider-keys/${envKey.fingerprint}`, { enabled: false });
    expect((await a.get("/api/admin/provider-keys")).body.keys.find((k: any) => k.fingerprint === envKey.fingerprint).enabled).toBe(false);

    await a.put("/api/admin/ai-settings", { displayName: "NOVA", welcomeMessage: "Salut" });
    settings.clearSettingsCache();
    expect((await request(app).get("/api/public/config")).body.ai.displayName).toBe("NOVA");
    const conv = (await user.post("/api/chat/conversations", {})).body.conversation;
    await send(user, conv.id, "hello");
    expect(mock.requests.at(-1)!.body.messages[0].content).toContain("your name is NOVA");

    expect((await a.post(`/api/admin/users/${u.id}/suspend`, { reason: "abuse" })).status).toBe(200);
    expect((await user.get("/api/auth/me")).body.user).toBeNull();
    await a.post(`/api/admin/users/${u.id}/reactivate`);
    await a.post(`/api/admin/users/${u.id}/tokens`, { amount: 5000, note: "goodwill" });
    expect((await a.get(`/api/admin/users/${u.id}`)).body.balance.bonus).toBe(5000);

    const promo = await a.post("/api/admin/promo-codes", { code: "LAUNCH50", type: "percent", value: 50, plans: ["premium"], maxUses: 10 });
    expect(promo.status).toBe(201);
    const { client: buyer } = await signup(app, "buyer@example.com");
    const v = await buyer.post("/api/billing/promo/validate", { code: "launch50", plan: "premium" });
    expect(v.body.finalCents).toBe(250);
    expect((await buyer.post("/api/billing/promo/validate", { code: "LAUNCH50", plan: "pro" })).body.error.code).toBe("promo_not_applicable");
    expect((await a.get("/api/admin/audit-logs")).body.logs.length).toBeGreaterThan(3);
  });
});

d("admin AI prompt", () => {
  it("accepts very long prompts with any characters and sends them intact", async () => {
    const a = await admin();
    const chunk = "Règle n°1 — réponds en français 🇫🇷✨ ; 中文测试 ; العربية ; \"quotes\" 'single' `code` $dollar {braces} <tag> & | \\ backslash \n## Markdown **bold** _it_\n```js\nconst x = a?.b ?? `t${1}`;\n```\n\t• bullet ½ ∑ π ≠ ≤ 😀👍🏽\n";
    const prompt = chunk.repeat(Math.ceil(300_000 / chunk.length)).slice(0, 300_000);
    const r = await a.put("/api/admin/ai-settings", { systemPrompt: prompt, personality: chunk.repeat(100) });
    expect(r.status).toBe(200);
    const back = (await a.get("/api/admin/ai-settings")).body.effective.systemPrompt;
    expect(back).toBe(prompt.trim());
    const tooLong = await a.put("/api/admin/ai-settings", { systemPrompt: "x".repeat(500_001) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.details[0].path).toBe("systemPrompt");
    settings.clearSettingsCache();
    const { client } = await signup(app, "longprompt@example.com");
    const conv = (await client.post("/api/chat/conversations", {})).body.conversation;
    await send(client, conv.id, "hello");
    const sent = mock.requests.at(-1)!.body.messages[0].content as string;
    expect(sent.startsWith(prompt.trim())).toBe(true);
    const bal = (await client.get("/api/tokens")).body.balance;
    expect(bal.used).toBeLessThan(2000);
  });
});

d("stripe webhooks", () => {
  it("verifies signatures, activates only on verified payment, and is idempotent", async () => {
    const { client, user } = await signup(app, "pay@example.com");
    const { setStripeClient } = await import("../src/services/billing/stripe.js");
    const s = new Stripe("sk_test_dummy");
    const fakeSub: any = { id: "sub_123", status: "active", metadata: { userId: user.id, plan: "pro" }, items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] } };
    (s.subscriptions as any).retrieve = async () => fakeSub;
    setStripeClient(s);
    const post = (event: object, sig?: string) => {
      const payload = JSON.stringify(event);
      const header = sig ?? s.webhooks.generateTestHeaderString({ payload, secret: "whsec_test_secret" });
      return request(app).post("/api/webhooks/stripe").set("stripe-signature", header).set("content-type", "application/json").send(payload);
    };
    const completed = { id: "evt_1", object: "event", type: "checkout.session.completed", data: { object: { id: "cs_1", mode: "subscription", subscription: "sub_123", payment_status: "paid" } } };
    expect((await post(completed, "t=1,v1=bad")).status).toBe(400);
    expect((await client.get("/api/auth/me")).body.user.plan).toBe("free");
    expect((await post(completed)).status).toBe(200);
    expect((await client.get("/api/auth/me")).body.user.plan).toBe("pro");
    expect((await client.get("/api/tokens")).body.balance.total).toBe(60000);
    expect((await post(completed)).body.duplicate).toBe(true);
    await post({ id: "evt_2", object: "event", type: "invoice.paid", data: { object: { id: "in_1", subscription: "sub_123", amount_paid: 199, currency: "usd" } } });
    expect((await client.get("/api/billing/overview")).body.payments[0].amountCents).toBe(199);
    await post({ id: "evt_3", object: "event", type: "invoice.payment_failed", data: { object: { id: "in_2", subscription: "sub_123", amount_due: 199, currency: "usd" } } });
    expect((await models.Subscription.findOne({}).lean<any>()).status).toBe("past_due");
    await post({ id: "evt_4", object: "event", type: "customer.subscription.deleted", data: { object: { id: "sub_123" } } });
    expect((await client.get("/api/auth/me")).body.user.plan).toBe("free");
    expect((await client.get("/api/tokens")).body.balance.total).toBe(25000);
    setStripeClient(null);
  });
});

d("health", () => {
  it("reports database connectivity", async () => {
    const r = await request(app).get("/health");
    expect(r.body).toMatchObject({ status: "ok", database: "connected" });
  });
});
