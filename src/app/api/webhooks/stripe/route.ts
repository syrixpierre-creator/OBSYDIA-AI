import { NextResponse } from "next/server";
import { getStripe, handleStripeEvent, stripeKeys } from "@/lib/stripe";
import { syslog } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Stripe → INCONNU SMS. Signature verified with the raw body; this is the ONLY place funds are credited. */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const { webhookSecret } = await stripeKeys();
  if (!sig || !webhookSecret) return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  const raw = await req.text();
  let event;
  try {
    const stripe = await getStripe();
    event = stripe.webhooks.constructEvent(raw, sig, webhookSecret);
  } catch (e) {
    await syslog("warn", "stripe", `Invalid webhook signature: ${(e as Error).message}`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  try {
    const r = await handleStripeEvent(event);
    return NextResponse.json({ received: true, ...r });
  } catch {
    // 500 → Stripe retries automatically with backoff
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
