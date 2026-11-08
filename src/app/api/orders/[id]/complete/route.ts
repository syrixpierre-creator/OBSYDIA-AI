import { ok, withUser } from "@/lib/http";
import { completeOrder, serializeOrder } from "@/lib/orders";

export const POST = withUser<{ params: Promise<{ id: string }> }>(async (_req, { user, params }) => {
  const { id } = await params;
  return ok({ order: serializeOrder(await completeOrder(id, user.id)) });
});
