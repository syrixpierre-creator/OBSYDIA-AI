import { z } from "zod";
import { limit, ok, parseJson, withUser } from "@/lib/http";
import { createTopupCheckout } from "@/lib/stripe";

export const POST = withUser(async (req, { user }) => {
  await limit(`checkout:${user.id}`, 10, 600);
  const { amountCents } = await parseJson(req, z.object({ amountCents: z.number().int().positive() }));
  return ok(await createTopupCheckout(user, amountCents));
});
