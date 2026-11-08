import { z } from "zod";
import { limit, ok, parseJson, withUser } from "@/lib/http";
import { createOrder, serializeOrder } from "@/lib/orders";
import { idempotencyKeySchema } from "@/lib/validators";

export const POST = withUser(async (req, { user }) => {
  await limit(`order:${user.id}`, 10, 60);
  const body = await parseJson(
    req,
    z.object({ countryId: z.number().int().positive(), serviceId: z.number().int().positive(), idempotencyKey: idempotencyKeySchema }),
  );
  const { order, duplicate } = await createOrder({ userId: user.id, countryId: body.countryId, serviceId: body.serviceId, idempotencyKey: body.idempotencyKey });
  return ok({ order: serializeOrder(order), duplicate }, duplicate ? 200 : 201);
});
