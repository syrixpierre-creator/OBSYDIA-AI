import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { decrypt, hmacSha256 } from "./crypto";

export async function notify(userId: string, title: string, body: string, link?: string) {
  await db.notification.create({ data: { userId, title, body, link } }).catch(() => {});
}

export const WEBHOOK_EVENTS = [
  "order.number_assigned",
  "order.sms_received",
  "order.cancelled",
  "order.expired",
  "order.failed",
  "wallet.credited",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/**
 * Deliver signed webhooks to the user's endpoints.
 * Header `X-Inconnu-Signature: t=<unix>,v1=<hex hmac-sha256(secret, "<t>.<body>")>`
 */
export async function dispatchWebhook(userId: string, event: WebhookEvent, data: unknown) {
  const hooks = await db.webhook.findMany({ where: { userId, enabled: true, events: { has: event } } });
  await Promise.all(
    hooks.map(async (hook) => {
      const payload = { id: crypto.randomUUID(), event, created: new Date().toISOString(), data };
      const body = JSON.stringify(payload);
      const t = Math.floor(Date.now() / 1000);
      let statusCode: number | null = null;
      let error: string | null = null;
      try {
        const secret = decrypt(hook.secret);
        const res = await fetch(hook.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": "InconnuSMS-Webhooks/1.0",
            "x-inconnu-event": event,
            "x-inconnu-signature": `t=${t},v1=${hmacSha256(secret, `${t}.${body}`)}`,
          },
          body,
          redirect: "manual",
          signal: AbortSignal.timeout(5000),
        });
        statusCode = res.status;
      } catch (e) {
        error = (e as Error).message.slice(0, 300);
      }
      const success = statusCode !== null && statusCode >= 200 && statusCode < 300;
      await db.$transaction([
        db.webhookDelivery.create({ data: { webhookId: hook.id, event, payload: payload as Prisma.InputJsonValue, statusCode, success, error } }),
        db.webhook.update({
          where: { id: hook.id },
          data: {
            lastDeliveryAt: new Date(),
            lastStatusCode: statusCode,
            failureCount: success ? 0 : { increment: 1 },
            // auto-disable after 20 consecutive failures
            ...(success ? {} : hook.failureCount + 1 >= 20 ? { enabled: false } : {}),
          },
        }),
      ]).catch(() => {});
    }),
  );
}

/** Fire-and-forget helper (never blocks or breaks the request path). */
export function emit(userId: string, event: WebhookEvent, data: unknown) {
  void dispatchWebhook(userId, event, data).catch((e) => console.error("[webhook]", e));
}
