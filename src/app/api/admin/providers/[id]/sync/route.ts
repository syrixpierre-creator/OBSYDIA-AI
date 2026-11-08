import { HttpError, ok, withUser } from "@/lib/http";
import { syncProvider } from "@/lib/catalog";
import { audit } from "@/lib/audit";

export const POST = withUser<{ params: Promise<{ id: string }> }>(
  async (_req, { user, params }) => {
    const { id } = await params;
    try {
      const r = await syncProvider(id);
      await audit({ actorId: user.id, action: "admin.provider_synced", entity: "provider", entityId: id, metadata: r });
      return ok(r);
    } catch (e) {
      throw new HttpError(502, `Sync failed: ${(e as Error).message}`, "sync_failed");
    }
  },
  { admin: true },
);
