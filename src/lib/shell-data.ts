import { db } from "./db";
import { ensureWallet } from "./wallet";

export async function shellData(userId: string) {
  const [wallet, notifications] = await Promise.all([
    ensureWallet(userId),
    db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  return {
    balanceCents: wallet.balanceCents,
    notifications: notifications.map((n) => ({ ...n, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() })),
  };
}
