import { z } from "zod";
import { limit, ok, parseJson, withUser } from "@/lib/http";
import { createOrderCheckout } from "@/lib/stripe";

export const POST = withUser(async (req, { user }) => {
  await limit(`checkout:${user.id}`, 10, 600);
  const b = await parseJson(req, z.object({ countryId: z.number().int().positive(), serviceId: z.number().int().positive() }));
  return ok(await createOrderCheckout(user, b.countryId, b.serviceId));
});
