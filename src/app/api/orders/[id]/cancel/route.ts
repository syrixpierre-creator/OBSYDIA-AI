import { limit, ok, withUser } from "@/lib/http";
import { cancelOrder, serializeOrder } from "@/lib/orders";

export const POST = withUser<{ params: Promise<{ id: string }> }>(async (_req, { user, params }) => {
  await limit(`cancel:${user.id}`, 20, 60);
  const { id } = await params;
  return ok({ order: serializeOrder(await cancelOrder(id, user.id)) });
});
