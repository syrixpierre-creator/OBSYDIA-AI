import type { Order, OrderSms, OrderStatus, Prisma } from "@prisma/client";
import { db } from "./db";
import { HttpError } from "./http";
import { applyWalletTx, isUniqueViolation } from "./wallet";
import { getAdapter } from "./providers/registry";
import { ProviderError } from "./providers/types";
import { loadPricingContext, quote } from "./pricing";
import { getSetting } from "./settings";
import { syslog } from "./audit";
import { emit, notify } from "./notify";

const OPEN_STATUSES: OrderStatus[] = ["PENDING", "ACTIVE", "RECEIVED"];

type OrderWithRelations = Order & {
  sms: OrderSms[];
  country: { code: string; name: string };
  service: { code: string; name: string };
};

export function serializeOrder(o: OrderWithRelations) {
  return {
    id: o.id,
    status: o.status,
    phone_number: o.phoneNumber,
    country: { code: o.country.code, name: o.country.name },
    service: { code: o.service.code, name: o.service.name },
    price: o.priceCents / 100,
    price_cents: o.priceCents,
    currency: "USD",
    demo: o.isDemo,
    expires_at: o.expiresAt?.toISOString() ?? null,
    created_at: o.createdAt.toISOString(),
    completed_at: o.completedAt?.toISOString() ?? null,
    failure_reason: o.failureReason,
    sms: o.sms.map((s) => ({
      id: s.id,
      sender: s.sender,
      text: s.text,
      code: s.code,
      received_at: s.receivedAt.toISOString(),
    })),
  };
}

const orderInclude = {
  sms: { orderBy: { receivedAt: "asc" } },
  country: { select: { code: true, name: true } },
  service: { select: { code: true, name: true } },
} satisfies Prisma.OrderInclude;

export async function getOrderForUser(orderId: string, userId: string) {
  const order = await db.order.findFirst({ where: { id: orderId, userId }, include: orderInclude });
  if (!order) throw new HttpError(404, "Order not found", "not_found");
  return order;
}

/** Refund an order back to the wallet exactly once (idempotent ledger key). */
async function refundOrderToWallet(tx: Prisma.TransactionClient, order: Order, reason: string) {
  // `transition()` guarantees a single caller reaches this point per order; the ledger key is a second safety net.
  const refund =
    (await tx.refund.findFirst({ where: { orderId: order.id, automatic: true } })) ??
    (await tx.refund.create({
      data: {
        userId: order.userId,
        orderId: order.id,
        amountCents: order.priceCents,
        reason,
        status: "COMPLETED",
        target: "WALLET",
        automatic: true,
        processedAt: new Date(),
      },
    }));
  await applyWalletTx(tx, {
    userId: order.userId,
    amountCents: order.priceCents,
    type: "REFUND",
    description: `Refund — order ${order.id.slice(-8)} (${reason})`,
    idempotencyKey: `order:refund:${order.id}`,
    orderId: order.id,
    refundId: refund.id,
  });
}

/** Transition order status only if it is still in one of `from` (prevents races / double refunds). */
async function transition(
  orderId: string,
  from: OrderStatus[],
  data: Prisma.OrderUncheckedUpdateManyInput,
  refundReason?: string,
) {
  return db.$transaction(async (tx) => {
    const res = await tx.order.updateMany({ where: { id: orderId, status: { in: from } }, data });
    if (res.count === 0) return false;
    if (refundReason) {
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      await refundOrderToWallet(tx, order, refundReason);
    }
    return true;
  });
}

const providerErrorMessage: Record<string, string> = {
  no_numbers: "No numbers are currently available for this selection. You have been refunded.",
  price_changed: "The supplier price changed. You have been refunded — please try again.",
  provider_balance: "Temporarily unavailable. You have been refunded.",
  timeout: "The supplier did not respond in time. You have been refunded.",
  unavailable: "The supplier is temporarily unavailable. You have been refunded.",
};

/**
 * Purchase flow:
 *  1. validation + anti-abuse checks
 *  2. idempotency (same key ⇒ same order, never charged twice)
 *  3. atomic: create PENDING order + debit wallet
 *  4. reserve number at provider — the number is only shown once confirmed
 *  5. failure ⇒ order FAILED + automatic wallet refund
 */
export async function createOrder(p: {
  userId: string;
  countryId: number;
  serviceId: number;
  idempotencyKey: string;
  apiKeyId?: string;
}) {
  const key = `${p.userId}:${p.idempotencyKey}`.slice(0, 190);
  const existing = await db.order.findUnique({ where: { idempotencyKey: key }, include: orderInclude });
  if (existing) return { order: existing, duplicate: true };

  const [user, general, orderSettings] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: p.userId } }),
    getSetting("general"),
    getSetting("orders"),
  ]);
  if (user.status !== "ACTIVE") throw new HttpError(403, "Account suspended", "account_suspended");
  if (general.maintenanceMode) throw new HttpError(503, "Platform under maintenance. Please retry later.", "maintenance");
  if (general.requireVerifiedEmailToPurchase && !user.emailVerifiedAt)
    throw new HttpError(403, "Please verify your email address before purchasing.", "email_not_verified");

  const [activeCount, lastHour] = await Promise.all([
    db.order.count({ where: { userId: p.userId, status: { in: OPEN_STATUSES } } }),
    db.order.count({ where: { userId: p.userId, createdAt: { gte: new Date(Date.now() - 3600_000) } } }),
  ]);
  if (activeCount >= orderSettings.maxActiveOrdersPerUser)
    throw new HttpError(429, `You already have ${activeCount} active orders. Complete or cancel some first.`, "too_many_active_orders");
  if (lastHour >= orderSettings.maxOrdersPerHour)
    throw new HttpError(429, "Hourly purchase limit reached. Please try again later.", "hourly_limit");

  const offerings = await db.providerService.findMany({
    where: {
      countryId: p.countryId,
      serviceId: p.serviceId,
      enabled: true,
      available: { gt: 0 },
      provider: { enabled: true },
      country: { enabled: true },
      service: { enabled: true },
    },
    include: { provider: true, country: true, service: true },
  });
  if (!offerings.length) throw new HttpError(409, "This service is currently out of stock for this country.", "out_of_stock");
  const ctx = await loadPricingContext();
  const ranked = offerings
    .map((o) => ({ o, q: quote(ctx, o) }))
    .sort((a, b) => a.q.priceCents - b.q.priceCents || a.o.provider.priority - b.o.provider.priority);
  const { o: offering, q } = ranked[0]!;

  // 3. atomic order creation + debit
  let order: Order;
  try {
    order = await db.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          userId: p.userId,
          providerId: offering.providerId,
          providerServiceId: offering.id,
          countryId: offering.countryId,
          serviceId: offering.serviceId,
          priceCents: q.priceCents,
          costCents: q.costCents,
          isDemo: offering.provider.isDemo,
          idempotencyKey: key,
          apiKeyId: p.apiKeyId,
          status: "PENDING",
        },
      });
      await applyWalletTx(tx, {
        userId: p.userId,
        amountCents: -q.priceCents,
        type: "DEBIT",
        description: `${offering.service.name} · ${offering.country.name} number`,
        idempotencyKey: `order:debit:${created.id}`,
        orderId: created.id,
      });
      return created;
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      const dup = await db.order.findUnique({ where: { idempotencyKey: key }, include: orderInclude });
      if (dup) return { order: dup, duplicate: true };
    }
    throw e;
  }

  // 4. reserve at provider
  const adapter = getAdapter(offering.provider);
  try {
    const num = await adapter.requestNumber({
      countryCode: offering.providerCountryCode,
      serviceCode: offering.providerServiceCode,
      maxCostCents: Math.min(q.priceCents - 1, Math.ceil(offering.costCents * 1.15)),
      reference: order.id,
    });
    const expiry = num.expiresAt ?? new Date(Date.now() + orderSettings.defaultExpiryMinutes * 60_000);
    await db.order.update({
      where: { id: order.id },
      data: {
        status: "ACTIVE",
        providerOrderId: num.providerOrderId,
        phoneNumber: num.phoneNumber,
        costCents: num.costCents,
        expiresAt: expiry,
        lastCheckedAt: new Date(),
      },
    });
    await db.providerService.update({ where: { id: offering.id }, data: { available: { decrement: 1 } } }).catch(() => {});
    const full = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
    emit(p.userId, "order.number_assigned", serializeOrder(full));
    return { order: full, duplicate: false };
  } catch (e) {
    const code = e instanceof ProviderError ? e.code : "unknown";
    const reason = providerErrorMessage[code] ?? "The number could not be reserved. You have been refunded.";
    await syslog("warn", `provider:${offering.provider.code}`, `requestNumber failed: ${(e as Error).message}`, { orderId: order.id, code });
    await transition(order.id, ["PENDING"], { status: "FAILED", failureReason: reason }, "provider_failure");
    if (code === "no_numbers") {
      await db.providerService.update({ where: { id: offering.id }, data: { available: 0 } }).catch(() => {});
    }
    const full = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
    emit(p.userId, "order.failed", serializeOrder(full));
    throw new HttpError(409, reason, code === "no_numbers" ? "out_of_stock" : "provider_error", { order_id: order.id });
  }
}

/** Poll provider for SMS and handle expiry. Safe to call concurrently. */
export async function refreshOrder(orderId: string, opts: { force?: boolean } = {}) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { provider: true, sms: true } });
  if (!["ACTIVE", "RECEIVED"].includes(order.status) || !order.providerOrderId) return;
  if (!opts.force && order.lastCheckedAt && Date.now() - order.lastCheckedAt.getTime() < 4000) return;
  await db.order.update({ where: { id: order.id }, data: { lastCheckedAt: new Date() } });

  const adapter = getAdapter(order.provider);
  const expired = order.expiresAt ? order.expiresAt.getTime() < Date.now() : false;
  let result;
  try {
    result = await adapter.getSMS(order.providerOrderId);
  } catch (e) {
    await syslog("warn", `provider:${order.provider.code}`, `getSMS failed: ${(e as Error).message}`, { orderId });
    if (!expired) return;
    result = { status: "expired" as const, messages: [] };
  }

  if (result.messages.length) {
    const res = await db.orderSms.createMany({
      data: result.messages.map((m) => ({
        orderId: order.id,
        providerSmsId: m.id,
        sender: m.sender,
        text: m.text.slice(0, 2000),
        code: m.code,
        receivedAt: m.receivedAt,
      })),
      skipDuplicates: true,
    });
    if (res.count > 0) {
      await db.order.updateMany({ where: { id: order.id, status: "ACTIVE" }, data: { status: "RECEIVED" } });
      const full = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
      await notify(order.userId, "SMS received", `New code for your ${full.service.name} number ${full.phoneNumber}.`, `/dashboard/orders/${order.id}`);
      emit(order.userId, "order.sms_received", serializeOrder(full));
    }
  }

  const hasSms = order.sms.length > 0 || result.messages.length > 0;
  if (result.status === "cancelled" && !hasSms) {
    await transition(order.id, ["ACTIVE"], { status: "CANCELLED", completedAt: new Date() }, "cancelled_by_provider");
  } else if (expired || result.status === "expired" || result.status === "finished") {
    if (hasSms) {
      await transition(order.id, ["ACTIVE", "RECEIVED"], { status: "COMPLETED", completedAt: new Date() });
    } else {
      const s = await getSetting("orders");
      const done = await transition(
        order.id,
        ["ACTIVE"],
        { status: "EXPIRED", completedAt: new Date() },
        s.autoRefundOnExpiry ? "expired_without_sms" : undefined,
      );
      if (done) {
        await adapter.cancelNumber(order.providerOrderId).catch(() => {});
        await notify(order.userId, "Number expired", "No SMS was received in time. Your wallet has been refunded.", `/dashboard/orders/${order.id}`);
        const full = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
        emit(order.userId, "order.expired", serializeOrder(full));
      }
    }
  }
}

export async function cancelOrder(orderId: string, userId: string) {
  const order = await db.order.findFirst({ where: { id: orderId, userId }, include: { provider: true, sms: true } });
  if (!order) throw new HttpError(404, "Order not found", "not_found");
  if (order.status !== "ACTIVE" || order.sms.length > 0)
    throw new HttpError(409, "Only active orders without received SMS can be cancelled.", "not_cancellable");
  const adapter = getAdapter(order.provider);
  if (!adapter.capabilities.cancel) throw new HttpError(409, "This supplier does not allow cancellation.", "not_supported");
  const r = await adapter.cancelNumber(order.providerOrderId!).catch((e) => {
    throw new HttpError(502, `Supplier refused cancellation: ${(e as Error).message}`, "provider_error");
  });
  if (!r.cancelled) {
    await refreshOrder(order.id, { force: true });
    throw new HttpError(409, "The supplier could not cancel this number (an SMS may have just arrived).", "not_cancellable");
  }
  await transition(order.id, ["ACTIVE"], { status: "CANCELLED", completedAt: new Date() }, "cancelled_by_user");
  const full = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  emit(userId, "order.cancelled", serializeOrder(full));
  return full;
}

export async function completeOrder(orderId: string, userId: string) {
  const order = await db.order.findFirst({ where: { id: orderId, userId }, include: { provider: true } });
  if (!order) throw new HttpError(404, "Order not found", "not_found");
  if (order.status !== "RECEIVED") throw new HttpError(409, "Only orders with a received SMS can be completed.", "invalid_state");
  await getAdapter(order.provider).finishNumber?.(order.providerOrderId!).catch(() => {});
  await transition(order.id, ["RECEIVED"], { status: "COMPLETED", completedAt: new Date() });
  return db.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
}

/** Background sync (worker / cron): poll open orders, expire, recover stuck PENDING. */
export async function syncOpenOrders() {
  const open = await db.order.findMany({
    where: {
      status: { in: ["ACTIVE", "RECEIVED"] },
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(Date.now() - 8000) } }],
    },
    select: { id: true },
    take: 200,
    orderBy: { lastCheckedAt: "asc" },
  });
  for (const o of open) await refreshOrder(o.id).catch((e) => console.error("[sync]", e));

  // PENDING for > 3 minutes means the process died mid-reservation → fail + refund
  const stuck = await db.order.findMany({
    where: { status: "PENDING", createdAt: { lt: new Date(Date.now() - 180_000) } },
    select: { id: true },
    take: 100,
  });
  for (const o of stuck)
    await transition(o.id, ["PENDING"], { status: "FAILED", failureReason: "Reservation timed out. Refunded." }, "reservation_timeout");

  return { polled: open.length, recovered: stuck.length };
}
