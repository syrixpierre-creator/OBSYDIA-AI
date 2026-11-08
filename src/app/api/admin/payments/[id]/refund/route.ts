import { z } from "zod";
import { ok, parseJson, withUser } from "@/lib/http";
import { refundPaymentToCard } from "@/lib/stripe";

export const POST = withUser<{ params: Promise<{ id: string }> }>(
  async (req, { user, params }) => {
    const { id } = await params;
    const b = await parseJson(req, z.object({ amountCents: z.number().int().positive(), reason: z.string().trim().min(3).max(200) }));
    const r = await refundPaymentToCard({ paymentId: id, amountCents: b.amountCents, reason: b.reason, adminId: user.id });
    return ok({ id: r.id });
  },
  { admin: true },
);
