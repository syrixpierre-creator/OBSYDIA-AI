import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(190);
export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128)
  .regex(/[a-z]/, "Password needs a lowercase letter")
  .regex(/[A-Z]/, "Password needs an uppercase letter")
  .regex(/\d/, "Password needs a number");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "You must accept the Terms and Acceptable Use Policy" }) }),
});

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });

export const idempotencyKeySchema = z.string().trim().min(8).max(100).regex(/^[A-Za-z0-9_\-:.]+$/, "Invalid idempotency key");

export const orderCreateSchema = z.object({
  country: z.union([z.string().trim().length(2), z.number().int().positive()]),
  service: z.union([z.string().trim().min(1).max(60), z.number().int().positive()]),
  idempotency_key: idempotencyKeySchema.optional(),
});

export function isSafeWebhookUrl(raw: string, allowHttp: boolean) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && !(allowHttp && u.protocol === "http:")) return false;
  const host = u.hostname.toLowerCase();
  if (allowHttp) return true;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
  if (host.startsWith("[") || host.includes(":")) return false; // block raw IPv6 literals
  return true;
}
