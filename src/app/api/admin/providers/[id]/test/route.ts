import { db } from "@/lib/db";
import { HttpError, ok, withUser } from "@/lib/http";
import { getAdapter } from "@/lib/providers/registry";

export const POST = withUser<{ params: Promise<{ id: string }> }>(
  async (_req, { params }) => {
    const { id } = await params;
    const p = await db.provider.findUniqueOrThrow({ where: { id } });
    const started = Date.now();
    try {
      const bal = await getAdapter(p).getBalance();
      await db.provider.update({ where: { id }, data: { balanceCents: bal.amountCents } });
      return ok({ ok: true, balance: bal, latencyMs: Date.now() - started });
    } catch (e) {
      throw new HttpError(502, `Connection failed: ${(e as Error).message}`, "provider_error");
    }
  },
  { admin: true },
);
