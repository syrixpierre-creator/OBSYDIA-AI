import express, { Router } from "express";
import { handleStripeWebhook } from "../services/billing/stripe.js";
import { handlePaypalWebhook } from "../services/billing/paypal.js";

export const webhooksRouter = Router();
const raw = express.raw({ type: "*/*", limit: "1mb" });

webhooksRouter.post("/stripe", raw, async (req, res) => {
  const result = await handleStripeWebhook(req.body as Buffer, req.get("stripe-signature"));
  res.json(result);
});

webhooksRouter.post("/paypal", raw, async (req, res) => {
  const result = await handlePaypalWebhook(req.body as Buffer, req.headers);
  res.json(result);
});
