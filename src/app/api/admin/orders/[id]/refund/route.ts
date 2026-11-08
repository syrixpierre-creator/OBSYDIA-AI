import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, ok, parseJson, withUser } from "@/lib/http";
import { applyWalletTx } from "@/lib/wallet";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";

/** Refund an order to the user's wallet (once per order — enforced by ledger key). */
export const POST = withUser<{ params: Promise<{ id: string }> }>(
  async (req, { user, params }) => {
    const { id } = await params;
    const { reason } = await parseJson(req, z.object({ reason: z.string().trim().min(3).max(200) }));
    const order = await db.order.findUnique({ where: { id } });
    if (!order) throw new HttpError(404, "Order not found", "not_found");
    const already = await db.walletTransaction.findUnique({ where: { idempotencyKey: `order:refund:${id}` } });
    if (already) throw new HttpError(409, "This order has already been refunded.", "already_refunded");
    if (order.status === "PENDING") throw new HttpError(409, "Order is still pending.", "invalid_state");
    await db.$transaction(async (tx) => {
      const refund = await tx.refund.create({
        data: { userId: order.userId, orderId: id, amountCents: order.priceCents, reason, status: "COMPLETED", target: "WALLET", processedById: user.id, processedAt: new Date() },
      });
      await applyWalletTx(tx, {
        userId: order.userId,
        amountCents: order.priceCents,
        type: "REFUND",
        description: `Refund — order ${id.slice(-8)} (${reason})`,
        idempotencyKey: `order:refund:${id}`,
        orderId: id,
        refundId: refund.id,
        actorId: user.id,
      });
      if (["ACTIVE", "RECEIVED"].includes(order.status)) await tx.order.update({ where: { id }, data: { status: "CANCELLED", completedAt: new Date() } });
    });
    await notify(order.userId, "Order refunded", `Your order was refunded to your wallet: ${reason}`, `/dashboard/orders/${id}`);
    await audit({ actorId: user.id, action: "admin.order_refunded", entity: "order", entityId: id, metadata: { reason } });
    return ok({ ok: true });
  },
  { admin: true },
);
