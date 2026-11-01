import type { Request } from "express";
import { z, type ZodTypeAny } from "zod";
import { badRequest } from "./errors.js";

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(
      "validation_error",
      "Invalid request",
      result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
    );
  }
  return result.data;
}

export const body = <T extends ZodTypeAny>(req: Request, schema: T) => parse(schema, req.body);
export const query = <T extends ZodTypeAny>(req: Request, schema: T) => parse(schema, req.query);

export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "invalid id");
export const email = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254);
export const password = z
  .string()
  .min(10, "at least 10 characters")
  .max(128)
  .regex(/[a-z]/i, "must contain a letter")
  .regex(/[0-9]/, "must contain a digit");

export const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30)
});

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeEmail(address: string) {
  const [local, domain] = address.toLowerCase().split("@");
  if (!local || !domain) return address.toLowerCase();
  let l = local.split("+")[0]!;
  if (domain === "gmail.com" || domain === "googlemail.com") {
    l = l.replace(/\./g, "");
    return `${l}@gmail.com`;
  }
  return `${l}@${domain}`;
}
