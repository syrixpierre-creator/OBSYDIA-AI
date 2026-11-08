import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, limit, ok, parseJson, withUser } from "@/lib/http";
import { generateApiKey } from "@/lib/api-auth";
import { audit } from "@/lib/audit";

export const POST = withUser(async (req, { user }) => {
  await limit(`apikey:${user.id}`, 10, 3600);
  const { name } = await parseJson(req, z.object({ name: z.string().trim().min(2).max(60) }));
  const active = await db.apiKey.count({ where: { userId: user.id, revokedAt: null } });
  if (active >= 10) throw new HttpError(409, "Maximum of 10 active API keys reached.", "limit_reached");
  const { key, hash, prefix } = generateApiKey();
  const row = await db.apiKey.create({ data: { userId: user.id, name, keyHash: hash, prefix } });
  await audit({ actorId: user.id, action: "api_key.created", entity: "api_key", entityId: row.id });
  // The full key is returned ONCE and never stored in clear text.
  return ok({ id: row.id, key, prefix }, 201);
});
