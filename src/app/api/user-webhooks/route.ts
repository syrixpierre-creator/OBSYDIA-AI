import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, ok, parseJson, withUser } from "@/lib/http";
import { encrypt, randomToken } from "@/lib/crypto";
import { WEBHOOK_EVENTS } from "@/lib/notify";
import { isSafeWebhookUrl } from "@/lib/validators";
import { env } from "@/lib/env";

export const POST = withUser(async (req, { user }) => {
  const b = await parseJson(req, z.object({ url: z.string().url().max(500), events: z.array(z.enum(WEBHOOK_EVENTS)).min(1) }));
  if (!isSafeWebhookUrl(b.url, !env.isProd)) throw new HttpError(422, "Webhook URL must be a public HTTPS URL.", "invalid_url");
  if ((await db.webhook.count({ where: { userId: user.id } })) >= 5) throw new HttpError(409, "Maximum of 5 webhooks.", "limit_reached");
  const secret = `whsec_${randomToken(24)}`;
  const hook = await db.webhook.create({ data: { userId: user.id, url: b.url, events: b.events, secret: encrypt(secret) } });
  return ok({ id: hook.id, secret }, 201);
});
