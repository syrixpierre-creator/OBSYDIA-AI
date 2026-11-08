import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, ok, parseJson, withUser } from "@/lib/http";
import { encrypt } from "@/lib/crypto";
import { audit } from "@/lib/audit";

export const PATCH = withUser<{ params: Promise<{ id: string }> }>(
  async (req, { user, params }) => {
    const { id } = await params;
    const b = await parseJson(
      req,
      z.object({
        enabled: z.boolean().optional(),
        priority: z.number().int().min(0).max(10000).optional(),
        name: z.string().trim().min(2).max(60).optional(),
        apiKey: z.string().max(500).optional(),
        clearApiKey: z.boolean().optional(),
      }),
    );
    if ((b.apiKey || b.clearApiKey) && user.role !== "SUPER_ADMIN") throw new HttpError(403, "Only a super admin can change API keys.", "forbidden");
    await db.provider.update({
      where: { id },
      data: {
        enabled: b.enabled,
        priority: b.priority,
        name: b.name,
        ...(b.apiKey ? { apiKeyEncrypted: encrypt(b.apiKey) } : {}),
        ...(b.clearApiKey ? { apiKeyEncrypted: null } : {}),
      },
    });
    const { apiKey, ...safe } = b;
    await audit({ actorId: user.id, action: "admin.provider_updated", entity: "provider", entityId: id, metadata: { ...safe, apiKeyChanged: Boolean(apiKey) } });
    return ok({ ok: true });
  },
  { admin: true },
);
