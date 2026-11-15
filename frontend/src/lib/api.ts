export class ApiError extends Error {
  status: number;
  code: string;
  details?: any;
  constructor(status: number, code: string, message: string, details?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function csrf() {
  const m = document.cookie.match(/(?:^|;\s*)obs_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : "";
}

async function ensureCsrf() {
  if (!csrf()) await fetch("/api/auth/csrf", { credentials: "same-origin" });
}

async function request<T>(method: string, url: string, body?: unknown, opts: { signal?: AbortSignal } = {}): Promise<T> {
  if (method !== "GET") await ensureCsrf();
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    signal: opts.signal,
    headers: {
      ...(method !== "GET" ? { "x-csrf-token": csrf() } : {}),
      ...(body !== undefined && !isForm ? { "content-type": "application/json" } : {})
    },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body)
  });
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const err = data?.error || {};
    throw new ApiError(res.status, err.code || "http_error", err.message || res.statusText, err.details);
  }
  return data as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export const api = {
  get: <T = any>(url: string, opts?: { signal?: AbortSignal }) => request<T>("GET", url, undefined, opts),
  post: <T = any>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T = any>(url: string, body?: unknown) => request<T>("PUT", url, body ?? {}),
  patch: <T = any>(url: string, body?: unknown) => request<T>("PATCH", url, body ?? {}),
  del: <T = any>(url: string) => request<T>("DELETE", url),
  upload: <T = any>(url: string, field: string, file: Blob, name: string, extra: Record<string, string> = {}) => {
    const fd = new FormData();
    fd.append(field, file, name);
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    return request<T>("POST", url, fd);
  }
};

export interface SseHandlers {
  onEvent: (event: string, data: any) => void;
}

export async function streamPost(url: string, body: unknown, handlers: SseHandlers, signal: AbortSignal) {
  await ensureCsrf();
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    signal,
    headers: { "content-type": "application/json", "x-csrf-token": csrf(), accept: "text/event-stream" },
    body: JSON.stringify(body)
  });
  if (!res.ok || !res.body) {
    const data = safeJson(await res.text());
    const err = data?.error || {};
    throw new ApiError(res.status, err.code || "http_error", err.message || res.statusText, err.details);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const ev = block.match(/^event: (.+)$/m)?.[1];
      const data = block.match(/^data: (.+)$/m)?.[1];
      if (ev && data) handlers.onEvent(ev, JSON.parse(data));
    }
  }
}

export function formatNumber(n: number, locale = "en") {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US").format(Math.round(n));
}

export function compact(n: number, locale = "en") {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(d: string | Date | null | undefined, locale = "en", withTime = true) {
  if (!d) return "—";
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(d));
}

export function relativeTime(d: string | Date, locale = "en") {
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale === "fr" ? "fr" : "en", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export function money(cents: number, locale = "en") {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
