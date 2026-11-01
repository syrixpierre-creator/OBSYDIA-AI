import mongoose, { Schema } from "mongoose";

const projectSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    teamId: { type: Schema.Types.ObjectId, ref: "Team", default: null, index: true },
    name: { type: String, required: true, maxlength: 120 },
    description: { type: String, default: "", maxlength: 4000 },
    stack: { type: [String], default: [] },
    status: { type: String, enum: ["draft", "planning", "generating", "ready", "error"], default: "draft" },
    progress: {
      stage: { type: String, default: "" },
      percent: { type: Number, default: 0 },
      message: { type: String, default: "" }
    },
    plan: { type: String, default: "" },
    entry: { type: String, default: "index.html" },
    previewable: { type: Boolean, default: false },
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", default: null },
    currentVersion: { type: Number, default: 0 },
    fileCount: { type: Number, default: 0 },
    totalBytes: { type: Number, default: 0 },
    source: { type: String, enum: ["generated", "upload", "manual"], default: "generated" },
    lastError: { type: String, default: null },
    validation: {
      ok: { type: Boolean, default: null },
      issues: { type: [String], default: [] },
      checkedAt: { type: Date, default: null }
    }
  },
  { timestamps: true, collection: "projects" }
);
projectSchema.index({ userId: 1, updatedAt: -1 });

export const Project = mongoose.models.Project || mongoose.model("Project", projectSchema);

const projectFileSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    path: { type: String, required: true, maxlength: 400 },
    content: { type: String, default: "" },
    encoding: { type: String, enum: ["utf8", "base64"], default: "utf8" },
    size: { type: Number, default: 0 },
    updatedBy: { type: String, enum: ["ai", "user", "upload"], default: "ai" }
  },
  { timestamps: true, collection: "project_files" }
);
projectFileSchema.index({ projectId: 1, path: 1 }, { unique: true });

export const ProjectFile = mongoose.models.ProjectFile || mongoose.model("ProjectFile", projectFileSchema);

const artifactSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    name: { type: String, required: true },
    latestVersion: { type: Number, default: 0 },
    status: { type: String, enum: ["building", "ready", "error"], default: "building" },
    lastError: { type: String, default: null }
  },
  { timestamps: true, collection: "artifacts" }
);

export const Artifact = mongoose.models.Artifact || mongoose.model("Artifact", artifactSchema);

const artifactVersionSchema = new Schema(
  {
    artifactId: { type: Schema.Types.ObjectId, ref: "Artifact", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    version: { type: Number, required: true },
    storagePath: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    fileCount: { type: Number, required: true },
    sha256: { type: String, required: true },
    note: { type: String, default: "" },
    snapshot: {
      type: [{ path: String, content: String, encoding: String, _id: false }],
      default: [],
      select: false
    }
  },
  { timestamps: true, collection: "artifact_versions" }
);
artifactVersionSchema.index({ artifactId: 1, version: -1 }, { unique: true });
artifactVersionSchema.index({ projectId: 1, version: -1 });

export const ArtifactVersion = mongoose.models.ArtifactVersion || mongoose.model("ArtifactVersion", artifactVersionSchema);

const uploadedFileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: ["image", "zip", "document", "audio", "code"], required: true },
    originalName: { type: String, required: true },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    storagePath: { type: String, required: true },
    sha256: { type: String, required: true },
    extractedText: { type: String, default: "", select: false },
    analysis: { type: Schema.Types.Mixed, default: null },
    via: { type: String, enum: ["app", "api"], default: "app" },
    expiresAt: { type: Date, default: null }
  },
  { timestamps: true, collection: "uploaded_files" }
);

export const UploadedFile = mongoose.models.UploadedFile || mongoose.model("UploadedFile", uploadedFileSchema);
