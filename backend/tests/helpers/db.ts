import mongoose from "mongoose";

let memory: any = null;

export async function startTestDb(): Promise<string | null> {
  if (process.env.MONGODB_TEST_URI) return process.env.MONGODB_TEST_URI;
  try {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    memory = await MongoMemoryServer.create();
    return memory.getUri("obsydia-test");
  } catch (err) {
    console.warn(`[tests] MongoDB unavailable (${(err as Error).message.split("\n")[0]}). Set MONGODB_TEST_URI to run database integration tests.`);
    return null;
  }
}

export async function stopTestDb() {
  await mongoose.disconnect().catch(() => undefined);
  if (memory) await memory.stop();
  memory = null;
}

export async function clearDb() {
  const db = mongoose.connection.db;
  if (!db) return;
  for (const c of await db.collections()) await c.deleteMany({});
}
