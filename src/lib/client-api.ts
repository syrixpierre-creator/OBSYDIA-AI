"use client";
import { toast } from "sonner";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, method: "GET" | "POST" | "PATCH" | "DELETE" = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: { message?: string; code?: string; details?: unknown } }).error;
    throw new ApiError(res.status, err?.message ?? `Request failed (${res.status})`, err?.code, err?.details);
  }
  return data as T;
}

/** Run an API call with toast feedback. Returns undefined on failure. */
export async function withToast<T>(p: Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const r = await p;
    if (success) toast.success(success);
    return r;
  } catch (e) {
    toast.error((e as Error).message || "Something went wrong");
    return undefined;
  }
}

export function newIdempotencyKey() {
  return `ui_${crypto.randomUUID()}`;
}
