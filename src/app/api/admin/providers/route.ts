import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, ok, parseJson, withUser } from "@/lib/http";
import { ADAPTERS } from "@/lib/providers/registry";
import { encrypt } from "@/lib/crypto";
import { audit } from "@/lib/audit";

export const POST = withUser(
  async (req, { user }) => {
    const b = await parseJson(
      req,
      z.object({
        code: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{2,30}$/),
        name: z.string().trim().min(2).max(60),
        adapter: z.string(),
        priority: z.number().int().min(0).max(10000).default(100),
        apiKey: z.string().max(500).optional(),
      }),
    );
    const entry = ADAPTERS[b.adapter];
    if (!entry) throw new HttpError(422, "Unknown adapter", "unknown_adapter");
    const p = await db.provider.create({
      data: { code: b.code, name: b.name, adapter: b.adapter, priority: b.priority, isDemo: entry.isDemo, apiKeyEncrypted: b.apiKey ? encrypt(b.apiKey) : null },
    });
    await audit({ actorId: user.id, action: "admin.provider_created", entity: "provider", entityId: p.id, metadata: { code: b.code } });
    return ok({ id: p.id }, 201);
  },
  { superAdmin: true },
);
