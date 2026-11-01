import request from "supertest";
import type { Express } from "express";
import { devOutbox } from "../../src/lib/mailer.js";

export function csrfFrom(res: request.Response) {
  const cookies = ([] as string[]).concat((res.headers["set-cookie"] as unknown as string[]) || []);
  const c = cookies.find((x) => x.startsWith("obs_csrf="));
  return c ? decodeURIComponent(c.split(";")[0]!.split("=")[1]!) : null;
}

export class Client {
  agent: request.Agent;
  csrf = "";
  constructor(app: Express) {
    this.agent = request.agent(app);
  }
  async init() {
    const res = await this.agent.get("/api/auth/me");
    this.csrf = csrfFrom(res) || this.csrf;
    return this;
  }
  get(url: string) {
    return this.agent.get(url);
  }
  private track(r: request.Test) {
    return r.set("x-csrf-token", this.csrf).on("response", (res: request.Response) => {
      const c = csrfFrom(res);
      if (c) this.csrf = c;
    });
  }
  post(url: string, body?: unknown) {
    return this.track(this.agent.post(url)).send(body as object);
  }
  put(url: string, body?: unknown) {
    return this.track(this.agent.put(url)).send(body as object);
  }
  patch(url: string, body?: unknown) {
    return this.track(this.agent.patch(url)).send(body as object);
  }
  delete(url: string) {
    return this.track(this.agent.delete(url));
  }
  upload(url: string, field: string, buf: Buffer, name: string) {
    return this.track(this.agent.post(url)).attach(field, buf, name);
  }
}

export function lastCodeFor(email: string) {
  const msg = [...devOutbox].reverse().find((m) => m.to === email && /\b\d{6}\b/.test(m.text));
  return msg?.text.match(/\b(\d{6})\b/)?.[1] ?? null;
}

export function lastLinkFor(email: string, pathPart: string) {
  const msg = [...devOutbox].reverse().find((m) => m.to === email && m.text.includes(pathPart));
  const m = msg?.text.match(/token=([A-Za-z0-9_-]+)/) || msg?.text.match(new RegExp(`${pathPart}([A-Za-z0-9_-]+)`));
  return m?.[1] ?? null;
}

export async function signup(app: Express, email: string, opts: { verify?: boolean; ref?: string; name?: string } = {}) {
  const c = await new Client(app).init();
  const res = await c.post("/api/auth/signup", { name: opts.name || "Test User", email, password: "Sup3rSecret-pass", ref: opts.ref });
  if (res.status !== 201) throw new Error(`signup failed ${res.status} ${JSON.stringify(res.body)}`);
  if (opts.verify !== false) {
    const code = lastCodeFor(email);
    const v = await c.post("/api/auth/verify-email", { code });
    if (v.status !== 200) throw new Error(`verify failed ${JSON.stringify(v.body)}`);
  }
  return { client: c, user: res.body.user };
}

export function parseSse(text: string) {
  return text
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const ev = block.match(/^event: (.+)$/m)?.[1];
      const data = block.match(/^data: (.+)$/m)?.[1];
      return ev && data ? { event: ev, data: JSON.parse(data) } : null;
    })
    .filter(Boolean) as { event: string; data: any }[];
}
