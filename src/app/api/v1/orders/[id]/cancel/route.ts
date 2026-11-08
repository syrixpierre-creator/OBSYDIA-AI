import { ok } from "@/lib/http";
import { withApiKey } from "@/lib/api-auth";
import { cancelOrder, serializeOrder } from "@/lib/orders";

export const POST = withApiKey<{ id: string }>(async (_req, { user, params }) => {
  return ok({ data: serializeOrder(await cancelOrder(params.id, user.id)) });
});
