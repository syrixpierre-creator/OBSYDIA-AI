import { db } from "@/lib/db";
import { HttpError, limit, ok, withUser } from "@/lib/http";
import { dispatchWebhook } from "@/lib/notify";

export const POST = withUser<{ params: Promise<{ id: string }> }>(async (_req, { user, params }) => {
  await limit(`whtest:${user.id}`, 5, 60);
  const { id } = await params;
  const hook = await db.webhook.findFirst({ where: { id, userId: user.id } });
  if (!hook) throw new HttpError(404, "Webhook not found", "not_found");
  await dispatchWebhook(user.id, hook.events[0] as never, { test: true, message: "Test delivery from INCONNU SMS" });
  const last = await db.webhookDelivery.findFirst({ where: { webhookId: id }, orderBy: { createdAt: "desc" } });
  return ok({ success: last?.success ?? false, statusCode: last?.statusCode ?? null, error: last?.error ?? null });
});
