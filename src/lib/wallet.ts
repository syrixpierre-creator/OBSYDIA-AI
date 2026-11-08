import { Prisma, type WalletTxType } from "@prisma/client";
import { db } from "./db";
import { HttpError } from "./http";

type Tx = Prisma.TransactionClient;

export async function ensureWallet(userId: string, tx: Tx | typeof db = db) {
  return tx.wallet.upsert({ where: { userId }, create: { userId }, update: {} });
}

/**
 * Apply a signed amount to a user's wallet inside a DB transaction.
 * - Atomic conditional update prevents negative balances under concurrency.
 * - `idempotencyKey` is UNIQUE: replaying the same operation never moves money twice.
 * Returns the ledger entry (existing one if already applied).
 */
export async function applyWalletTx(
  tx: Tx,
  p: {
    userId: string;
    amountCents: number;
    type: WalletTxType;
    description: string;
    idempotencyKey: string;
    orderId?: string;
    paymentId?: string;
    refundId?: string;
    actorId?: string;
    allowNegative?: boolean;
  },
) {
  if (!Number.isInteger(p.amountCents) || p.amountCents === 0) throw new Error("Invalid wallet amount");
  const existing = await tx.walletTransaction.findUnique({ where: { idempotencyKey: p.idempotencyKey } });
  if (existing) return existing;

  const wallet = await ensureWallet(p.userId, tx);
  const guard = p.amountCents < 0 && !p.allowNegative ? { balanceCents: { gte: -p.amountCents } } : {};
  const res = await tx.wallet.updateMany({
    where: { id: wallet.id, ...guard },
    data: { balanceCents: { increment: p.amountCents } },
  });
  if (res.count === 0) throw new HttpError(402, "Insufficient wallet balance. Please add funds.", "insufficient_funds");
  const updated = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });

  return tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: p.type,
      amountCents: p.amountCents,
      balanceAfterCents: updated.balanceCents,
      description: p.description.slice(0, 255),
      idempotencyKey: p.idempotencyKey,
      orderId: p.orderId,
      paymentId: p.paymentId,
      refundId: p.refundId,
      actorId: p.actorId,
    },
  });
}

export async function walletOperation(p: Parameters<typeof applyWalletTx>[1]) {
  return db.$transaction((tx) => applyWalletTx(tx, p), { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}
