import mongoose, { Schema } from "mongoose";

const conversationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, default: "New conversation", maxlength: 200 },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    model: { type: String, default: null },
    lastMessageAt: { type: Date, default: Date.now },
    messageCount: { type: Number, default: 0 },
    archived: { type: Boolean, default: false }
  },
  { timestamps: true, collection: "conversations" }
);
conversationSchema.index({ userId: 1, lastMessageAt: -1 });
conversationSchema.index({ title: "text" });

export const Conversation = mongoose.models.Conversation || mongoose.model("Conversation", conversationSchema);

const attachmentSchema = new Schema(
  {
    fileId: { type: Schema.Types.ObjectId, ref: "UploadedFile" },
    kind: { type: String, enum: ["image", "zip", "document", "audio", "code"] },
    name: String,
    mime: String,
    size: Number
  },
  { _id: false }
);

const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["user", "assistant", "system"], required: true },
    content: { type: String, default: "" },
    attachments: { type: [attachmentSchema], default: [] },
    status: { type: String, enum: ["complete", "streaming", "stopped", "error"], default: "complete" },
    error: { type: String, default: null },
    model: { type: String, default: null },
    usage: {
      promptTokens: { type: Number, default: 0 },
      completionTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
      estimated: { type: Boolean, default: false }
    },
    feedback: { type: String, enum: ["up", "down", null], default: null },
    artifactId: { type: Schema.Types.ObjectId, ref: "Artifact", default: null },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    parentId: { type: Schema.Types.ObjectId, default: null }
  },
  { timestamps: true, collection: "messages" }
);
messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ userId: 1, createdAt: -1 });
messageSchema.index({ content: "text" });

export const Message = mongoose.models.Message || mongoose.model("Message", messageSchema);

const pinnedSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true }
  },
  { timestamps: true, collection: "pinned_conversations" }
);
pinnedSchema.index({ userId: 1, conversationId: 1 }, { unique: true });

export const PinnedConversation = mongoose.models.PinnedConversation || mongoose.model("PinnedConversation", pinnedSchema);
