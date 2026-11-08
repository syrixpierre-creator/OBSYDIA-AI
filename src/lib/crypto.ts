import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { env } from "./env";

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacSha256(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function key() {
  return createHash("sha256").update(env.encryptionKey).digest();
}

/** AES-256-GCM encryption for secrets stored in DB (provider/stripe keys). */
export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decrypt(payload: string) {
  const [v, iv, tag, data] = payload.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Invalid encrypted payload");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

export function maskSecret(secret: string | null | undefined) {
  if (!secret) return null;
  if (secret.length <= 8) return "••••";
  return `${secret.slice(0, 4)}••••••••${secret.slice(-4)}`;
}
