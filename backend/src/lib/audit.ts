import type { Request } from "express";
import { AuditLog } from "../models/index.js";
import { ipHash } from "./request.js";
import { logger } from "./logger.js";

export async function audit(
  req: Request | null,
  action: string,
  opts: { actorId?: unknown; targetType?: string; targetId?: unknown; meta?: Record<string, unknown> } = {}
) {
  try {
    await AuditLog.create({
      actorId: opts.actorId ?? (req as any)?.user?._id ?? null,
      action,
      targetType: opts.targetType ?? null,
      targetId: opts.targetId ? String(opts.targetId) : null,
      ipHash: req ? ipHash(req) : null,
      meta: opts.meta ?? {}
    });
  } catch (err) {
    logger.warn({ action, err: (err as Error).message }, "audit write failed");
  }
}
