import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseJson, withUser } from "@/lib/http";

export const PATCH = withUser(async (req, { user }) => {
  const { name } = await parseJson(req, z.object({ name: z.string().trim().min(2).max(80) }));
  await db.user.update({ where: { id: user.id }, data: { name } });
  return ok({ ok: true });
});
