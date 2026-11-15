import mongoose, { Schema, type InferSchemaType, type HydratedDocument } from "mongoose";

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    normalizedEmail: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    passwordHash: { type: String, default: null },
    googleId: { type: String, default: null, index: { unique: true, partialFilterExpression: { googleId: { $type: "string" } } } },
    role: { type: String, enum: ["user", "admin"], default: "user", index: true },
    status: { type: String, enum: ["active", "suspended"], default: "active", index: true },
    suspendedReason: { type: String, default: null },
    emailVerified: { type: Boolean, default: false, index: true },
    emailVerifiedAt: { type: Date, default: null },
    pendingEmail: { type: String, default: null },
    locale: { type: String, enum: ["en", "fr"], default: "en" },
    plan: { type: String, enum: ["free", "pro", "premium", "custom"], default: "free", index: true },
    planExpiresAt: { type: Date, default: null },
    referralCode: { type: String, required: true, unique: true },
    referredBy: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    signupIpHash: { type: String, default: null, index: true },
    sessionVersion: { type: Number, default: 0 },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    lastActiveAt: { type: Date, default: null, index: true },
    stripeCustomerId: { type: String, default: null, index: true },
    preferences: {
      theme: { type: String, default: "dark" },
      aiLanguage: { type: String, enum: ["auto", "en", "fr"], default: "auto" }
    }
  },
  { timestamps: true, collection: "users" }
);

userSchema.index({ createdAt: -1 });
userSchema.index({ name: "text", email: "text" });

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const User = mongoose.models.User || mongoose.model("User", userSchema);

const verificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    purpose: { type: String, enum: ["verify_email", "reset_password", "change_email"], required: true },
    codeHash: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true },
    target: { type: String, default: null },
    attempts: { type: Number, default: 0 },
    usedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true, collection: "verification_tokens" }
);
verificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
verificationSchema.index({ userId: 1, purpose: 1, createdAt: -1 });

export const VerificationToken = mongoose.models.VerificationToken || mongoose.model("VerificationToken", verificationSchema);

const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    userAgent: { type: String, default: "" },
    ipHash: { type: String, default: "" },
    lastSeenAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true, collection: "sessions" }
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.models.Session || mongoose.model("Session", sessionSchema);
