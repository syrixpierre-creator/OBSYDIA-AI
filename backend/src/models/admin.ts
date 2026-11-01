import mongoose, { Schema } from "mongoose";

const adminSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true, collection: "admin_settings" }
);

export const AdminSetting = mongoose.models.AdminSetting || mongoose.model("AdminSetting", adminSettingSchema);

const providerKeySchema = new Schema(
  {
    label: { type: String, required: true, maxlength: 60 },
    owner: { type: String, default: "", maxlength: 80 },
    provider: { type: String, default: "xkiro" },
    encryptedKey: { type: String, required: true, select: false },
    fingerprint: { type: String, required: true, unique: true },
    masked: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    addedBy: { type: Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true, collection: "provider_keys" }
);

export const ProviderKey = mongoose.models.ProviderKey || mongoose.model("ProviderKey", providerKeySchema);

const providerUsageSchema = new Schema(
  {
    keyFingerprint: { type: String, required: true },
    day: { type: String, required: true },
    requests: { type: Number, default: 0 },
    successes: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    rateLimited: { type: Number, default: 0 },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    lastSuccessAt: { type: Date, default: null },
    lastErrorAt: { type: Date, default: null },
    lastError: { type: String, default: null }
  },
  { timestamps: true, collection: "provider_usage" }
);
providerUsageSchema.index({ keyFingerprint: 1, day: 1 }, { unique: true });

export const ProviderUsage = mongoose.models.ProviderUsage || mongoose.model("ProviderUsage", providerUsageSchema);

const auditSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    action: { type: String, required: true },
    targetType: { type: String, default: null },
    targetId: { type: String, default: null },
    ipHash: { type: String, default: null },
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: "audit_logs" }
);
auditSchema.index({ createdAt: -1 });
auditSchema.index({ actorId: 1, createdAt: -1 });
auditSchema.index({ action: 1, createdAt: -1 });

export const AuditLog = mongoose.models.AuditLog || mongoose.model("AuditLog", auditSchema);
