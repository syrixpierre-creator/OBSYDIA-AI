import { ok } from "@/lib/http";
import { withApiKey } from "@/lib/api-auth";
import { getOrderForUser, refreshOrder, serializeOrder } from "@/lib/orders";

export const GET = withApiKey<{ id: string }>(async (_req, { user, params }) => {
  await getOrderForUser(params.id, user.id);
  await refreshOrder(params.id).catch(() => {});
  const o = serializeOrder(await getOrderForUser(params.id, user.id));
  return ok({ data: { order_id: o.id, status: o.status, phone_number: o.phone_number, sms: o.sms } });
});
