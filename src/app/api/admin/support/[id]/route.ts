import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseJson, withUser } from "@/lib/http";

export const PATCH = withUser<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const { id } = await params;
    const b = await parseJson(
      req,
      z.object({ status: z.enum(["OPEN", "PENDING", "ANSWERED", "CLOSED"]).optional(), priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional() }),
    );
    await db.supportTicket.update({ where: { id }, data: b });
    return ok({ ok: true });
  },
  { admin: true },
);
