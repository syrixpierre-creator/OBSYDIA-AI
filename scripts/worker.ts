/**
 * Background worker — runs in its own container.
 * Calls the protected cron endpoint so all business logic stays in the app:
 *  - orders  every 10s  (SMS polling, expiry, auto-refunds, stuck reservations)
 *  - catalog every 10m  (provider countries/services/prices/stock sync)
 *  - cleanup every 1h   (expired sessions, old tokens, old API logs)
 */
const base = (process.env.INTERNAL_APP_URL || "http://app:3000").replace(/\/$/, "");
const secret = process.env.CRON_SECRET || "";
if (!secret) {
  console.error("[worker] CRON_SECRET is required");
  process.exit(1);
}

async function run(task: string) {
  try {
    const res = await fetch(`${base}/api/cron/sync?task=${task}`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(120_000),
    });
    const body = await res.text();
    if (!res.ok) console.error(`[worker] ${task} → ${res.status} ${body.slice(0, 200)}`);
    else if (task !== "orders" || !body.includes('"polled":0')) console.log(`[worker] ${task} → ${body.slice(0, 200)}`);
  } catch (e) {
    console.error(`[worker] ${task} failed: ${(e as Error).message}`);
  }
}

function every(ms: number, task: string) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    await run(task);
    running = false;
  };
  setTimeout(tick, 5_000);
  setInterval(tick, ms);
}

console.log(`[worker] started → ${base}`);
every(10_000, "orders");
every(10 * 60_000, "catalog");
every(60 * 60_000, "cleanup");
