import "./config/loadEnvFile.js";
import { env } from "./config/env.js";
import { providerConfig } from "./config/provider.js";
import { logger } from "./lib/logger.js";
import { connectDb, disconnectDb, syncIndexes } from "./lib/db.js";
import { ensureDataDirs } from "./lib/storage.js";
import { createApp } from "./app.js";
import { providerManager } from "./services/ai/providerManager.js";
import { expireLapsedPlans } from "./services/billing/subscriptions.js";
import { ensureInitialAdmin } from "./services/bootstrap.js";
import { closeRedis } from "./lib/rateLimit.js";
import { Project } from "./models/index.js";

async function main() {
  let e;
  try {
    e = env();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
  ensureDataDirs();
  await connectDb();
  await syncIndexes();
  await ensureInitialAdmin();
  await Project.updateMany(
    { status: { $in: ["planning", "generating"] } },
    { $set: { status: "error", lastError: "Interrupted by a server restart", progress: { stage: "error", percent: 100, message: "Interrupted by a server restart" } } }
  );
  await providerManager.refresh(true);
  const a = providerManager.availability();
  const pc = providerConfig();
  if (!a.total) logger.warn(`No ${pc.label} API key configured. Add keys to AI_API_KEYS or through the admin dashboard.`);
  else logger.info({ provider: pc.name, model: pc.model, keys: a.total }, `${pc.label} provider keys loaded`);

  const app = createApp();
  const server = app.listen(e.PORT, () => logger.info({ port: e.PORT, url: e.APP_URL }, `${e.APP_NAME} listening`));
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  server.requestTimeout = 0;

  const sweeper = setInterval(() => void expireLapsedPlans().catch((err) => logger.warn({ err: err.message }, "plan sweep failed")), 10 * 60_000);
  sweeper.unref();

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "shutting down");
    clearInterval(sweeper);
    const force = setTimeout(() => process.exit(1), 15_000);
    force.unref();
    server.close(async () => {
      await disconnectDb().catch(() => undefined);
      await closeRedis();
      process.exit(0);
    });
    server.closeIdleConnections?.();
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("unhandledRejection", (err) => logger.error({ err }, "unhandled rejection"));
}

void main().catch((err) => {
  logger.fatal({ err }, "startup failed");
  process.exit(1);
});
