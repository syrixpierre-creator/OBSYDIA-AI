import { ok, withUser } from "@/lib/http";
import { getOrderForUser, refreshOrder, serializeOrder } from "@/lib/orders";

export const GET = withUser<{ params: Promise<{ id: string }> }>(async (_req, { user, params }) => {
  const { id } = await params;
  await getOrderForUser(id, user.id);
  await refreshOrder(id).catch(() => {});
  return ok({ order: serializeOrder(await getOrderForUser(id, user.id)) });
});
