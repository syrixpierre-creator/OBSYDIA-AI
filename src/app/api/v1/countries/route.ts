import { db } from "@/lib/db";
import { ok } from "@/lib/http";
import { withApiKey } from "@/lib/api-auth";

export const GET = withApiKey(async () => {
  const countries = await db.country.findMany({
    where: { enabled: true, offerings: { some: { enabled: true, provider: { enabled: true } } } },
    orderBy: { name: "asc" },
    select: { code: true, name: true },
  });
  return ok({ data: countries });
});
