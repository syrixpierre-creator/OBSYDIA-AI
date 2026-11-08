import { z } from "zod";
import { db } from "@/lib/db";
import { limit, ok, parseJson, withUser } from "@/lib/http";

export const POST = withUser(async (req, { user }) => {
  await limit(`ticket:${user.id}`, 5, 3600);
  const b = await parseJson(
    req,
    z.object({
      subject: z.string().trim().min(4).max(120),
      category: z.enum(["general", "order", "payment", "api", "account"]),
      message: z.string().trim().min(10).max(5000),
      orderId: z.string().max(40).optional(),
      priority: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"),
    }),
  );
  const ticket = await db.supportTicket.create({
    data: {
      userId: user.id,
      subject: b.subject,
      category: b.category,
      priority: b.priority,
      orderId: b.orderId || null,
      messages: { create: { authorId: user.id, body: b.message } },
    },
  });
  return ok({ id: ticket.id }, 201);
});
