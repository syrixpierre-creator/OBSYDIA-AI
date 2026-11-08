import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, limit, ok, parseJson, withUser } from "@/lib/http";
import { isAdminRole } from "@/lib/auth";
import { notify } from "@/lib/notify";

export const POST = withUser<{ params: Promise<{ id: string }> }>(async (req, { user, params }) => {
  await limit(`reply:${user.id}`, 30, 600);
  const { id } = await params;
  const { body } = await parseJson(req, z.object({ body: z.string().trim().min(1).max(5000) }));
  const staff = isAdminRole(user.role);
  const ticket = await db.supportTicket.findFirst({ where: staff ? { id } : { id, userId: user.id } });
  if (!ticket) throw new HttpError(404, "Ticket not found", "not_found");
  if (ticket.status === "CLOSED" && !staff) throw new HttpError(409, "This ticket is closed.", "closed");
  await db.$transaction([
    db.ticketMessage.create({ data: { ticketId: id, authorId: user.id, body, isStaff: staff } }),
    db.supportTicket.update({ where: { id }, data: { status: staff ? "ANSWERED" : "OPEN" } }),
  ]);
  if (staff && ticket.userId !== user.id) await notify(ticket.userId, "Support replied", ticket.subject, `/dashboard/support/${id}`);
  return ok({ ok: true });
});
