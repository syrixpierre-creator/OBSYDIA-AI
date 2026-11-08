import { ok } from "@/lib/http";
import { withApiKey } from "@/lib/api-auth";
import { getOrderForUser, refreshOrder, serializeOrder } from "@/lib/orders";

export const GET = withApiKey<{ id: string }>(async (_req, { user, params }) => {
  await getOrderForUser(params.id, user.id);
  await refreshOrder(params.id).catch(() => {});
  return ok({ data: serializeOrder(await getOrderForUser(params.id, user.id)) });
});
