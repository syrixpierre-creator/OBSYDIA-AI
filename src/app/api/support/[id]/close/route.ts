import { db } from "@/lib/db";
import { HttpError, ok, withUser } from "@/lib/http";
import { isAdminRole } from "@/lib/auth";

export const POST = withUser<{ params: Promise<{ id: string }> }>(async (_req, { user, params }) => {
  const { id } = await params;
  const where = isAdminRole(user.role) ? { id } : { id, userId: user.id };
  const res = await db.supportTicket.updateMany({ where, data: { status: "CLOSED" } });
  if (!res.count) throw new HttpError(404, "Ticket not found", "not_found");
  return ok({ ok: true });
});
