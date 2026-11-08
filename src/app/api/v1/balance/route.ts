import { ok } from "@/lib/http";
import { withApiKey } from "@/lib/api-auth";
import { ensureWallet } from "@/lib/wallet";

export const GET = withApiKey(async (_req, { user }) => {
  const w = await ensureWallet(user.id);
  return ok({ data: { balance: w.balanceCents / 100, balance_cents: w.balanceCents, currency: w.currency } });
});
