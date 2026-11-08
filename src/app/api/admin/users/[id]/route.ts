import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, ok, parseJson, withUser } from "@/lib/http";
import { audit } from "@/lib/audit";

export const PATCH = withUser<{ params: Promise<{ id: string }> }>(
  async (req, { user, params }) => {
    const { id } = await params;
    const b = await parseJson(
      req,
      z.object({
        status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
        suspendedReason: z.string().max(200).optional(),
        role: z.enum(["USER", "ADMIN", "SUPER_ADMIN"]).optional(),
        verifyEmail: z.boolean().optional(),
      }),
    );
    const target = await db.user.findUnique({ where: { id }, include: { role: true } });
    if (!target) throw new HttpError(404, "User not found", "not_found");
    if (target.id === user.id) throw new HttpError(409, "You cannot modify your own account here.", "self_edit");
    if (target.role.name === "SUPER_ADMIN" && user.role !== "SUPER_ADMIN") throw new HttpError(403, "Only a super admin can modify a super admin.", "forbidden");
    if (b.role && user.role !== "SUPER_ADMIN") throw new HttpError(403, "Only a super admin can change roles.", "forbidden");
    const role = b.role ? await db.role.findUniqueOrThrow({ where: { name: b.role } }) : null;
    await db.$transaction([
      db.user.update({
        where: { id },
        data: {
          ...(b.status ? { status: b.status, suspendedReason: b.status === "SUSPENDED" ? (b.suspendedReason ?? null) : null } : {}),
          ...(role ? { roleId: role.id } : {}),
          ...(b.verifyEmail ? { emailVerifiedAt: new Date() } : {}),
        },
      }),
      // suspended users are logged out immediately
      ...(b.status === "SUSPENDED" ? [db.session.deleteMany({ where: { userId: id } })] : []),
    ]);
    await audit({ actorId: user.id, action: "admin.user_updated", entity: "user", entityId: id, metadata: b });
    return ok({ ok: true });
  },
  { admin: true },
);
