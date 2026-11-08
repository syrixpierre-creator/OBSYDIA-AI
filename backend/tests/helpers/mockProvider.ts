import http from "node:http";
import type { AddressInfo } from "node:net";

export type KeyBehavior =
  | { type: "ok" }
  | { type: "rate_limit"; retryAfter?: string }
  | { type: "unauthorized" }
  | { type: "server_error" }
  | { type: "bad_request"; message?: string }
  | { type: "hang" };

export interface MockProvider {
  url: string;
  requests: { key: string; body: any }[];
  behaviors: Map<string, KeyBehavior>;
  rejectStreamOptions: boolean;
  rejectThinking: boolean;
  reply: (body: any) => string;
  close: () => Promise<void>;
}

export function defaultReply(body: any): string {
  const last = [...(body.messages || [])].reverse().find((m: any) => m.role === "user");
  const text = typeof last?.content === "string" ? last.content : (last?.content || []).map((p: any) => p.text || "").join(" ");
  const system = String(body.messages?.[0]?.content || "");
  if (text.includes("Reply ONLY with JSON of the shape")) {
    return JSON.stringify({
      name: "Todo Studio",
      summary: "A static todo application",
      stack: ["HTML", "CSS", "JavaScript"],
      entry: "index.html",
      files: [
        { path: "index.html", purpose: "Main page" },
        { path: "styles.css", purpose: "Styles" },
        { path: "app.js", purpose: "Logic" },
        { path: "README.md", purpose: "Docs" }
      ]
    });
  }
  if (text.includes("Now write exactly these files")) {
    const out: string[] = ["Here are the files."];
    const files: Record<string, string> = {
      "index.html": '<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head><body><h1 id="t">Todo Studio</h1><script src="app.js"></script></body></html>',
      "styles.css": "body{background:#000;color:#fff}",
      "app.js": "const items = [];\nfunction add(x){ items.push(x); return items.length; }\ndocument.getElementById('t').dataset.ready = String(add('a'));",
      "README.md": "# Todo Studio\n\nOpen index.html."
    };
    for (const [p, c] of Object.entries(files)) if (text.includes(`- ${p}:`)) out.push(`<<<FILE: ${p}>>>\n${c}\n<<<END FILE>>>`);
    return out.join("\n");
  }
  if (text.includes("You are modifying an existing project")) {
    return '<<<FILE: styles.css>>>\nbody{background:#08090D;color:#fff}\n<<<END FILE>>>\n<<<FILE: about.html>>>\n<!doctype html><html><body>About</body></html>\n<<<END FILE>>>';
  }
  if (/who (created|made) you/i.test(text)) {
    const m = system.match(/answer exactly: "([^"]+)"/);
    return m ? m[1]! : "unknown";
  }
  return `Echo: ${text}`;
}

export async function startMockProvider(): Promise<MockProvider> {
  const state: MockProvider = {
    url: "",
    requests: [],
    behaviors: new Map(),
    rejectStreamOptions: false,
    rejectThinking: false,
    reply: defaultReply,
    close: async () => undefined
  };
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const key = String(req.headers.authorization || "").replace(/^Bearer\s+/, "");
      const body = raw ? JSON.parse(raw) : {};
      state.requests.push({ key, body });
      if (req.url?.endsWith("/models")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ object: "list", data: [{ id: "qwen/qwen3.8-omni-flash:free", object: "model" }] }));
        return;
      }
      const behavior = state.behaviors.get(key) || { type: "ok" };
      const json = (status: number, payload: unknown, headers: Record<string, string> = {}) => {
        res.writeHead(status, { "content-type": "application/json", ...headers });
        res.end(JSON.stringify(payload));
      };
      if (behavior.type === "hang") return;
      if (behavior.type === "rate_limit") return json(429, { error: { message: "Rate limit reached" } }, behavior.retryAfter ? { "retry-after": behavior.retryAfter } : {});
      if (behavior.type === "unauthorized") return json(401, { error: { message: "Invalid API key" } });
      if (behavior.type === "server_error") return json(500, { error: { message: "Upstream failure" } });
      if (behavior.type === "bad_request") return json(400, { error: { message: behavior.message || "bad request" } });
      if (body.thinking && state.rejectThinking) return json(400, { error: { message: "Unknown parameter: thinking" } });
      if (body.stream && body.stream_options && state.rejectStreamOptions) return json(400, { error: { message: "Unknown parameter: stream_options" } });
      const content = state.reply(body);
      const usage = { prompt_tokens: 50, completion_tokens: Math.ceil(content.length / 4), total_tokens: 50 + Math.ceil(content.length / 4) };
      if (!body.stream) {
        return json(200, { id: "cmpl-1", object: "chat.completion", model: body.model, choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }], usage });
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      const pieces = content.match(/.{1,12}/gs) || [""];
      for (const p of pieces) {
        res.write(`data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", model: body.model, choices: [{ index: 0, delta: { content: p }, finish_reason: null }] })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", model: body.model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
      if (body.stream_options?.include_usage) res.write(`data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", model: body.model, choices: [], usage })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  state.close = () =>
    new Promise<void>((r) => {
      server.closeAllConnections();
      server.close(() => r());
    });
  return state;
}
