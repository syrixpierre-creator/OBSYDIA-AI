import mongoose, { Schema } from "mongoose";

const balanceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    plan: { type: String, required: true },
    allowance: { type: Number, required: true },
    used: { type: Number, default: 0 },
    reservations: {
      type: [{ rid: { type: String, required: true }, amount: { type: Number, required: true }, expiresAt: { type: Date, required: true }, _id: false }],
      default: []
    },
    bonus: { type: Number, default: 0 },
    periodStart: { type: Date, required: true },
    resetAt: { type: Date, required: true, index: true }
  },
  { timestamps: true, collection: "token_balances", optimisticConcurrency: false }
);

export const TokenBalance = mongoose.models.TokenBalance || mongoose.model("TokenBalance", balanceSchema);

const txSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["usage", "reset", "referral_bonus", "admin_adjustment", "plan_change", "refund"], required: true },
    amount: { type: Number, required: true },
    source: { type: String, enum: ["allowance", "bonus", "mixed", "system"], default: "allowance" },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    estimated: { type: Boolean, default: false },
    feature: { type: String, default: "chat" },
    via: { type: String, enum: ["app", "api", "system"], default: "app" },
    refId: { type: String, default: null },
    balanceAfter: { type: Number, default: null },
    note: { type: String, default: "" }
  },
  { timestamps: true, collection: "token_transactions" }
);
txSchema.index({ userId: 1, createdAt: -1 });
txSchema.index({ createdAt: -1, type: 1 });

export const TokenTransaction = mongoose.models.TokenTransaction || mongoose.model("TokenTransaction", txSchema);
