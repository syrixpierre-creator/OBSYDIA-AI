import { getSetting } from "./settings";
import { stripeKeys } from "./stripe";

export async function cardPaymentsAvailable() {
  const [s, keys] = await Promise.all([getSetting("payments"), stripeKeys()]);
  return { topup: s.enabled && Boolean(keys.secretKey), directOrder: s.enabled && s.allowDirectCardPurchase && Boolean(keys.secretKey), settings: s };
}
