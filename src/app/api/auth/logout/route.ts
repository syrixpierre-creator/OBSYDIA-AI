import { destroySession } from "@/lib/auth";
import { ok, withPublic } from "@/lib/http";

export const POST = withPublic(async () => {
  await destroySession();
  return ok({ ok: true });
});
