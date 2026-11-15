import crypto from "node:crypto";
import { env } from "../config/env.js";

function deriveKey(secret: string, label: string) {
  return crypto.createHash("sha256").update(`${label}:${secret}`).digest();
}

export function encrypt(plain: string): string {
  const key = deriveKey(env().ENCRYPTION_KEY, "obsydia-enc-v1");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(".");
}

export function decrypt(payload: string): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unsupported ciphertext");
  const key = deriveKey(env().ENCRYPTION_KEY, "obsydia-enc-v1");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function hmac(value: string, label = "sign") {
  return crypto.createHmac("sha256", deriveKey(env().SESSION_SECRET, label)).update(value).digest("base64url");
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function randomCode(length = 6) {
  let out = "";
  for (let i = 0; i < length; i++) out += crypto.randomInt(0, 10).toString();
  return out;
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function maskSecret(secret: string) {
  if (secret.length <= 10) return "••••";
  return `${secret.slice(0, 4)}••••••••${secret.slice(-4)}`;
}

export function signPayload(payload: Record<string, unknown>, ttlSeconds: number, label: string) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  return `${body}.${hmac(body, label)}`;
}

export function verifyPayload<T extends Record<string, unknown>>(token: string, label: string): T | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || !safeEqual(sig, hmac(body, label))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof data.exp !== "number" || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data as T;
  } catch {
    return null;
  }
}
