import { db } from "@/lib/db";
import { HttpError, ok, parseJson } from "@/lib/http";
import { withApiKey } from "@/lib/api-auth";
import { createOrder, serializeOrder } from "@/lib/orders";
import { idempotencyKeySchema, orderCreateSchema } from "@/lib/validators";

export const GET = withApiKey(async (req, { user }) => {
  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  const cursor = url.searchParams.get("cursor") || undefined;
  const orders = await db.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { sms: true, country: true, service: true },
  });
  const hasMore = orders.length > limit;
  const page = orders.slice(0, limit);
  return ok({ data: page.map(serializeOrder), next_cursor: hasMore ? page[page.length - 1]!.id : null });
});

export const POST = withApiKey(async (req, { user, apiKey }) => {
  const body = await parseJson(req, orderCreateSchema);
  const headerKey = req.headers.get("idempotency-key");
  const idem = headerKey ? idempotencyKeySchema.parse(headerKey) : body.idempotency_key;
  const country =
    typeof body.country === "number"
      ? await db.country.findUnique({ where: { id: body.country } })
      : await db.country.findUnique({ where: { code: body.country.toUpperCase() } });
  const service =
    typeof body.service === "number"
      ? await db.service.findUnique({ where: { id: body.service } })
      : await db.service.findUnique({ where: { code: body.service.toLowerCase() } });
  if (!country) throw new HttpError(404, "Unknown country code", "unknown_country");
  if (!service) throw new HttpError(404, "Unknown service code", "unknown_service");
  const { order, duplicate } = await createOrder({
    userId: user.id,
    countryId: country.id,
    serviceId: service.id,
    idempotencyKey: `api:${idem ?? crypto.randomUUID()}`,
    apiKeyId: apiKey.id,
  });
  return ok({ data: serializeOrder(order), duplicate }, duplicate ? 200 : 201);
});
