/**
 * Seeder — idempotent, safe to run on every deploy.
 * - roles (USER, ADMIN, SUPER_ADMIN)
 * - Super Admin account from ADMIN_EMAIL / ADMIN_PASSWORD (created once)
 * - DEMO provider (clearly flagged; can be disabled in Admin → Providers)
 * - default settings
 * The catalog (countries/services/prices) is NOT seeded by hand: it is pulled
 * from the providers by the sync job.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  for (const [name, description] of [
    ["USER", "Customer account"],
    ["ADMIN", "Platform administrator"],
    ["SUPER_ADMIN", "Full access including secrets & admin management"],
  ] as const) {
    await db.role.upsert({ where: { name }, create: { name, description }, update: {} });
  }

  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  if (email && password) {
    const existing = await db.user.findUnique({ where: { email } });
    if (!existing) {
      const role = await db.role.findUniqueOrThrow({ where: { name: "SUPER_ADMIN" } });
      const user = await db.user.create({
        data: {
          email,
          name: process.env.ADMIN_NAME || "Super Admin",
          passwordHash: await bcrypt.hash(password, 12),
          roleId: role.id,
          emailVerifiedAt: new Date(),
          wallet: { create: {} },
        },
      });
      await db.auditLog.create({ data: { actorId: user.id, action: "seed.super_admin_created", entity: "user", entityId: user.id } });
      console.log(`✔ Super admin created: ${email}`);
    } else {
      console.log(`• Super admin already exists: ${email}`);
    }
  } else {
    console.log("! ADMIN_EMAIL / ADMIN_PASSWORD not set — no admin created");
  }

  await db.provider.upsert({
    where: { code: "demo" },
    create: { code: "demo", name: "DEMO Provider", adapter: "demo", isDemo: true, enabled: process.env.DEMO_PROVIDER !== "false", priority: 1000 },
    update: {},
  });
  console.log("✔ Demo provider ready");

  for (const key of ["general", "pricing", "payments", "orders"]) {
    await db.setting.upsert({ where: { key }, create: { key, value: {} }, update: {} });
  }
  console.log("✔ Settings ready");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
