import { z } from "zod";
import { ok, parseJson, withUser } from "@/lib/http";
import { walletOperation } from "@/lib/wallet";
import { audit } from "@/lib/audit";

/** Manual balance adjustment — super admin only, always audited and recorded in the ledger. */
export const POST = withUser<{ params: Promise<{ id: string }> }>(
  async (req, { user, params }) => {
    const { id } = await params;
    const b = await parseJson(
      req,
      z.object({ amountCents: z.number().int().refine((v) => v !== 0 && Math.abs(v) <= 1_000_000), reason: z.string().trim().min(3).max(200), requestId: z.string().min(8).max(64) }),
    );
    const tx = await walletOperation({
      userId: id,
      amountCents: b.amountCents,
      type: "ADJUSTMENT",
      description: `Admin adjustment: ${b.reason}`,
      idempotencyKey: `admin-adjust:${b.requestId}`,
      actorId: user.id,
    });
    await audit({ actorId: user.id, action: "admin.wallet_adjusted", entity: "user", entityId: id, metadata: { amountCents: b.amountCents, reason: b.reason } });
    return ok({ balanceCents: tx.balanceAfterCents });
  },
  { superAdmin: true },
);
