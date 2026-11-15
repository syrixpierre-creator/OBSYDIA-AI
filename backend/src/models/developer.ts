import mongoose, { Schema } from "mongoose";

const apiKeySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, maxlength: 60 },
    prefix: { type: String, required: true },
    keyHash: { type: String, required: true, unique: true },
    lastFour: { type: String, required: true },
    revokedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
    requestCount: { type: Number, default: 0 }
  },
  { timestamps: true, collection: "api_keys" }
);

export const ApiKey = mongoose.models.ApiKey || mongoose.model("ApiKey", apiKeySchema);

const apiUsageSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    apiKeyId: { type: Schema.Types.ObjectId, ref: "ApiKey", required: true },
    endpoint: { type: String, required: true },
    method: { type: String, required: true },
    status: { type: Number, required: true },
    tokens: { type: Number, default: 0 },
    latencyMs: { type: Number, default: 0 },
    errorCode: { type: String, default: null }
  },
  { timestamps: true, collection: "api_usage" }
);
apiUsageSchema.index({ userId: 1, createdAt: -1 });
apiUsageSchema.index({ apiKeyId: 1, createdAt: -1 });
apiUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

export const ApiUsage = mongoose.models.ApiUsage || mongoose.model("ApiUsage", apiUsageSchema);
