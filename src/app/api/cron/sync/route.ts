import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { syncOpenOrders } from "@/lib/orders";
import { syncAllProviders } from "@/lib/catalog";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Called by the worker container (scripts/worker.ts):
 *   POST /api/cron/sync?task=orders   — every ~10s
 *   POST /api/cron/sync?task=catalog  — every ~10min
 *   POST /api/cron/sync?task=cleanup  — hourly
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!env.cronSecret || !safeEqual(auth, env.cronSecret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const task = new URL(req.url).searchParams.get("task") ?? "orders";
  try {
    if (task === "orders") return NextResponse.json(await syncOpenOrders());
    if (task === "catalog") return NextResponse.json(await syncAllProviders());
    if (task === "cleanup") {
      const now = new Date();
      const [s, t, l] = await Promise.all([
        db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
        db.verificationToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 7 * 86400_000) } } }),
        db.apiLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86400_000) } } }),
      ]);
      return NextResponse.json({ sessions: s.count, tokens: t.count, apiLogs: l.count });
    }
    return NextResponse.json({ error: "Unknown task" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
