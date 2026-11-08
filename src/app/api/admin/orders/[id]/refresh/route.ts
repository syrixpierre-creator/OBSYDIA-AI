import { ok, withUser } from "@/lib/http";
import { refreshOrder } from "@/lib/orders";

export const POST = withUser<{ params: Promise<{ id: string }> }>(
  async (_req, { params }) => {
    const { id } = await params;
    await refreshOrder(id, { force: true });
    return ok({ ok: true });
  },
  { admin: true },
);
