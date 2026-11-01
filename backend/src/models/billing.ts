import mongoose, { Schema } from "mongoose";

const subscriptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    plan: { type: String, enum: ["pro", "premium", "custom"], required: true },
    provider: { type: String, enum: ["stripe", "paypal", "manual"], required: true },
    providerSubscriptionId: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "active", "past_due", "canceled", "expired", "incomplete"],
      default: "pending",
      index: true
    },
    currentPeriodEnd: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    canceledAt: { type: Date, default: null },
    promoCodeId: { type: Schema.Types.ObjectId, ref: "PromoCode", default: null }
  },
  { timestamps: true, collection: "subscriptions" }
);
subscriptionSchema.index({ provider: 1, providerSubscriptionId: 1 }, { unique: true });

export const Subscription = mongoose.models.Subscription || mongoose.model("Subscription", subscriptionSchema);

const paymentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: "Subscription", default: null },
    provider: { type: String, enum: ["stripe", "paypal"], required: true },
    providerPaymentId: { type: String, required: true },
    amountCents: { type: Number, required: true },
    currency: { type: String, default: "usd" },
    status: { type: String, enum: ["succeeded", "failed", "refunded", "partially_refunded", "pending"], required: true, index: true },
    plan: { type: String, default: null },
    description: { type: String, default: "" },
    refundedCents: { type: Number, default: 0 }
  },
  { timestamps: true, collection: "payments" }
);
paymentSchema.index({ provider: 1, providerPaymentId: 1 }, { unique: true });
paymentSchema.index({ createdAt: -1 });

export const Payment = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);

const webhookEventSchema = new Schema(
  {
    provider: { type: String, required: true },
    eventId: { type: String, required: true },
    type: { type: String, required: true },
    processedAt: { type: Date, default: null },
    error: { type: String, default: null }
  },
  { timestamps: true, collection: "webhook_events" }
);
webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

export const WebhookEvent = mongoose.models.WebhookEvent || mongoose.model("WebhookEvent", webhookEventSchema);

const promoSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: "" },
    type: { type: String, enum: ["percent", "fixed"], required: true },
    value: { type: Number, required: true, min: 0 },
    plans: { type: [String], default: ["pro", "premium"] },
    maxUses: { type: Number, default: null },
    uses: { type: Number, default: 0 },
    expiresAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true, collection: "promo_codes" }
);

export const PromoCode = mongoose.models.PromoCode || mongoose.model("PromoCode", promoSchema);

const promoRedemptionSchema = new Schema(
  {
    promoCodeId: { type: Schema.Types.ObjectId, ref: "PromoCode", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    plan: String,
    provider: String,
    checkoutRef: { type: String, required: true },
    discountCents: Number,
    status: { type: String, enum: ["reserved", "redeemed", "released"], default: "reserved" }
  },
  { timestamps: true, collection: "promo_redemptions" }
);
promoRedemptionSchema.index({ checkoutRef: 1 }, { unique: true });

export const PromoRedemption = mongoose.models.PromoRedemption || mongoose.model("PromoRedemption", promoRedemptionSchema);
