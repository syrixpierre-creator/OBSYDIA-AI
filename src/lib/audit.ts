import type { Prisma } from "@prisma/client";
import { db } from "./db";

export async function audit(params: {
  actorId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
}) {
  try {
    await db.auditLog.create({
      data: {
        actorId: params.actorId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        metadata: params.metadata ?? {},
        ip: params.ip ?? null,
      },
    });
  } catch (e) {
    console.error("[audit] failed", e);
  }
}

export async function syslog(level: "info" | "warn" | "error", source: string, message: string, context: Prisma.InputJsonValue = {}) {
  const line = `[${level}] [${source}] ${message}`;
  if (level === "error") console.error(line, context);
  else console.log(line);
  try {
    await db.systemLog.create({ data: { level, source, message: message.slice(0, 2000), context } });
  } catch {
    /* never throw from logging */
  }
}
