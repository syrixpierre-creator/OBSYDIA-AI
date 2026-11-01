import fs from "node:fs";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { Artifact, ArtifactVersion, Conversation, Message, Project, ProjectFile, Team, TeamMember } from "../models/index.js";
import { requireAuth, requireVerified } from "../middleware/auth.js";
import { body, objectId, parse } from "../lib/validate.js";
import { AppError, badRequest, forbidden, notFound } from "../lib/errors.js";
import { signPayload, verifyPayload } from "../lib/crypto.js";
import { projectAccess } from "../services/access.js";
import { cancelJob, isRunning, saveFiles, startEdit, startGeneration } from "../services/projects/builder.js";
import { artifactFilePath, buildArtifact, refreshProjectStats, restoreVersion, slugify } from "../services/artifacts.js";
import { isForbiddenPath } from "../services/projects/fileFormat.js";
import { safeRelativePath } from "../services/files.js";
import { limiter } from "../lib/rateLimit.js";
import { titleFrom } from "../services/ai/prompt.js";
import { audit } from "../lib/audit.js";

export const projectsRouter = Router();

const jobLimiter = limiter("project-jobs", { windowMs: 60 * 60_000, limit: 40, keyGenerator: (req) => String((req as any).user?._id) });

function present(p: any, role = "owner") {
  return {
    id: String(p._id),
    name: p.name,
    description: p.description,
    stack: p.stack,
    status: p.status,
    progress: p.progress,
    entry: p.entry,
    previewable: p.previewable,
    currentVersion: p.currentVersion,
    fileCount: p.fileCount,
    totalBytes: p.totalBytes,
    source: p.source,
    lastError: p.lastError,
    validation: p.validation,
    teamId: p.teamId ? String(p.teamId) : null,
    conversationId: p.conversationId ? String(p.conversationId) : null,
    running: isRunning(String(p._id)),
    role,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt
  };
}

projectsRouter.get("/download/:token", requireAuth, async (req, res) => {
  const data = verifyPayload<{ v: string; u: string }>(String(req.params.token), "artifact");
  if (!data || data.u !== String(req.user._id)) throw forbidden("link_expired", "This download link is invalid or has expired");
  const v = await ArtifactVersion.findById(data.v).lean<any>();
  if (!v) throw notFound("version_not_found");
  const project = await Project.findById(v.projectId).lean<any>();
  const p = artifactFilePath(v.storagePath);
  if (!fs.existsSync(p)) throw notFound("artifact_missing", "The archive file is missing from storage");
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Length", String(v.sizeBytes));
  res.setHeader("Content-Disposition", `attachment; filename="${slugify(project?.name || "project")}-v${v.version}.zip"`);
  res.setHeader("Cache-Control", "private, no-store");
  fs.createReadStream(p).pipe(res);
});

projectsRouter.use(requireVerified);

projectsRouter.get("/", async (req, res) => {
  const memberships = await TeamMember.find({ userId: req.user._id }).lean<any[]>();
  const teamIds = memberships.map((m) => m.teamId);
  const roles = new Map(memberships.map((m) => [String(m.teamId), m.role]));
  const projects = await Project.find({ $or: [{ userId: req.user._id }, { teamId: { $in: teamIds } }] })
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean<any[]>();
  res.json({
    projects: projects.map((p) => present(p, String(p.userId) === String(req.user._id) ? "owner" : roles.get(String(p.teamId)) || "viewer"))
  });
});

projectsRouter.post("/", async (req, res) => {
  const input = body(req, z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(4000).optional() }));
  const project = await Project.create({ userId: req.user._id, name: input.name, description: input.description || "", status: "ready", source: "manual" });
  res.status(201).json({ project: present(project) });
});

projectsRouter.post("/generate", jobLimiter, async (req, res) => {
  const input = body(
    req,
    z.object({ prompt: z.string().trim().min(8).max(20_000), conversationId: objectId.optional(), language: z.enum(["auto", "en", "fr"]).optional() })
  );
  const active = await Project.countDocuments({ userId: req.user._id, status: { $in: ["planning", "generating"] } });
  if (active >= 2) throw new AppError(429, "too_many_jobs", "Wait for your current generations to finish");
  let conversationId = input.conversationId || null;
  if (conversationId) {
    const conv = await Conversation.findOne({ _id: conversationId, userId: req.user._id });
    if (!conv) throw notFound("conversation_not_found");
  } else {
    const conv = await Conversation.create({ userId: req.user._id, title: titleFrom(input.prompt) });
    conversationId = String(conv._id);
  }
  const project = await Project.create({
    userId: req.user._id,
    name: titleFrom(input.prompt).slice(0, 80),
    description: input.prompt.slice(0, 4000),
    status: "planning",
    progress: { stage: "queued", percent: 1, message: "Queued" },
    conversationId
  });
  await Message.create({ conversationId, userId: req.user._id, role: "user", content: input.prompt, projectId: project._id });
  await Conversation.updateOne({ _id: conversationId }, { $set: { lastMessageAt: new Date(), projectId: project._id }, $inc: { messageCount: 1 } });
  await startGeneration(String(project._id), req.user._id, input.prompt, input.language || req.user.preferences?.aiLanguage || "auto");
  res.status(202).json({ project: present(project), conversationId });
});

projectsRouter.get("/:id", async (req, res) => {
  const { project, role } = await projectAccess(req, String(req.params.id), "read");
  const [files, artifact, versions] = await Promise.all([
    ProjectFile.find({ projectId: project._id }).select("path size encoding updatedBy updatedAt").sort({ path: 1 }).lean<any[]>(),
    Artifact.findOne({ projectId: project._id }).lean<any>(),
    ArtifactVersion.find({ projectId: project._id }).sort({ version: -1 }).limit(50).lean<any[]>()
  ]);
  res.json({
    project: present(project, role),
    files: files.map((f) => ({ path: f.path, size: f.size, binary: f.encoding === "base64", updatedBy: f.updatedBy, updatedAt: f.updatedAt })),
    artifact: artifact ? { id: String(artifact._id), status: artifact.status, latestVersion: artifact.latestVersion, lastError: artifact.lastError, createdAt: artifact.createdAt } : null,
    versions: versions.map((v) => ({ version: v.version, sizeBytes: v.sizeBytes, fileCount: v.fileCount, sha256: v.sha256, note: v.note, createdAt: v.createdAt }))
  });
});

projectsRouter.get("/:id/file", async (req, res) => {
  const { project } = await projectAccess(req, String(req.params.id), "read");
  const { path } = parse(z.object({ path: z.string().min(1).max(400) }), req.query);
  const f = await ProjectFile.findOne({ projectId: project._id, path }).lean<any>();
  if (!f) throw notFound("file_not_found");
  res.json({ path: f.path, content: f.encoding === "base64" ? null : f.content, binary: f.encoding === "base64", size: f.size });
});

projectsRouter.put("/:id/file", async (req, res) => {
  const { project } = await projectAccess(req, String(req.params.id), "write");
  if (isRunning(String(project._id))) throw new AppError(409, "project_busy", "Wait for the current AI job to finish");
  const input = body(req, z.object({ path: z.string().min(1).max(400), content: z.string().max(2_000_000) }));
  const p = safeRelativePath(input.path);
  if (!p || isForbiddenPath(p)) throw badRequest("invalid_path", "This file path is not allowed");
  const count = await ProjectFile.countDocuments({ projectId: project._id });
  if (count >= 1000 && !(await ProjectFile.exists({ projectId: project._id, path: p }))) throw badRequest("too_many_files");
  await saveFiles(project._id, [{ path: p, content: input.content }], [], "user");
  res.json({ ok: true, path: p });
});

projectsRouter.post("/:id/file/rename", async (req, res) => {
  const { project } = await projectAccess(req, String(req.params.id), "write");
  const input = body(req, z.object({ from: z.string().min(1).max(400), to: z.string().min(1).max(400) }));
  const to = safeRelativePath(input.to);
  if (!to || isForbiddenPath(to)) throw badRequest("invalid_path");
  if (await ProjectFile.exists({ projectId: project._id, path: to })) throw badRequest("file_exists", "A file already exists at this path");
  const r = await ProjectFile.updateOne({ projectId: project._id, path: input.from }, { $set: { path: to, updatedBy: "user" } });
  if (!r.matchedCount) throw notFound("file_not_found");
  await refreshProjectStats(project._id);
  res.json({ ok: true });
});

projectsRouter.delete("/:id/file", async (req, res) => {
  const { project } = await projectAccess(req, String(req.params.id), "write");
  const { path } = parse(z.object({ path: z.string().min(1).max(400) }), req.query);
  const r = await ProjectFile.deleteMany({ projectId: project._id, $or: [{ path }, { path: { $regex: `^${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/` } }] });
  if (!r.deletedCount) throw notFound("file_not_found");
  await refreshProjectStats(project._id);
  res.json({ ok: true, deleted: r.deletedCount });
});

projectsRouter.post("/:id/edit", jobLimiter, async (req, res) => {
  const { project } = await projectAccess(req, String(req.params.id), "write");
  const input = body(req, z.object({ instruction: z.string().trim().min(3).max(20_000), language: z.enum(["auto", "en", "fr"]).optional() }));
  if (!project.fileCount) throw badRequest("project_empty", "The project has no files yet");
  if (project.conversationId) {
    await Message.create({ conversationId: project.conversationId, userId: req.user._id, role: "user", content: input.instruction, projectId: project._id });
    await Conversation.updateOne({ _id: project.conversationId }, { $set: { lastMessageAt: new Date() }, $inc: { messageCount: 1 } });
  }
  await startEdit(String(project._id), req.user._id, input.instruction, input.language || req.user.preferences?.aiLanguage || "auto");
  res.status(202).json({ ok: true });
});

projectsRouter.post("/:id/cancel", async (req, res) => {
  const { project } = await projectAccess(req, String(req.params.id), "write");
  cancelJob(String(project._id));
  res.json({ ok: true });
});

projectsRouter.post("/:id/artifact", async (req, res) => {
  const { project } = await projectAccess(req, String(req.params.id), "write");
  if (isRunning(String(project._id))) throw new AppError(409, "project_busy");
  const result = await buildArtifact(project._id, "Manual rebuild");
  res.status(201).json(result);
});

projectsRouter.post("/:id/versions/:version/restore", async (req, res) => {
  const { project } = await projectAccess(req, String(req.params.id), "write");
  if (isRunning(String(project._id))) throw new AppError(409, "project_busy");
  const version = parse(z.coerce.number().int().min(1), req.params.version);
  const result = await restoreVersion(project._id, version);
  res.json(result);
});

projectsRouter.post("/:id/versions/:version/link", async (req, res) => {
  const { project } = await projectAccess(req, String(req.params.id), "read");
  const version = parse(z.coerce.number().int().min(1), req.params.version);
  const v = await ArtifactVersion.findOne({ projectId: project._id, version }).lean<any>();
  if (!v) throw notFound("version_not_found");
  const ttl = env().ARTIFACT_LINK_TTL_MINUTES * 60;
  const token = signPayload({ v: String(v._id), u: String(req.user._id) }, ttl, "artifact");
  res.json({ url: `/api/projects/download/${token}`, expiresAt: new Date(Date.now() + ttl * 1000) });
});

projectsRouter.post("/:id/preview-link", async (req, res) => {
  const { project } = await projectAccess(req, String(req.params.id), "read");
  if (!project.previewable) throw badRequest("not_previewable", "This project has no HTML entry point to preview");
  const ttl = env().PREVIEW_LINK_TTL_MINUTES * 60;
  const token = signPayload({ p: String(project._id) }, ttl, "preview");
  const base = process.env.PREVIEW_URL || env().APP_URL;
  res.json({ url: `${base.replace(/\/$/, "")}/preview/${token}/${project.entry}`, entry: project.entry, expiresAt: new Date(Date.now() + ttl * 1000) });
});

projectsRouter.patch("/:id", async (req, res) => {
  const { project } = await projectAccess(req, String(req.params.id), "owner");
  const input = body(req, z.object({ name: z.string().trim().min(1).max(120).optional(), shareWithTeam: z.boolean().optional() }));
  if (input.name) project.name = input.name;
  if (input.shareWithTeam !== undefined) {
    if (input.shareWithTeam) {
      const team = await Team.findOne({ ownerId: req.user._id }).lean<any>();
      if (!team) throw badRequest("no_team", "Create a team before sharing projects");
      project.teamId = team._id;
    } else project.teamId = null;
  }
  await project.save();
  res.json({ project: present(project) });
});

projectsRouter.delete("/:id", async (req, res) => {
  const { project } = await projectAccess(req, String(req.params.id), "owner");
  cancelJob(String(project._id));
  const versions = await ArtifactVersion.find({ projectId: project._id }).lean<any[]>();
  for (const v of versions) fs.rmSync(artifactFilePath(v.storagePath), { force: true });
  await Promise.all([
    ProjectFile.deleteMany({ projectId: project._id }),
    ArtifactVersion.deleteMany({ projectId: project._id }),
    Artifact.deleteMany({ projectId: project._id }),
    Project.deleteOne({ _id: project._id })
  ]);
  await audit(req, "project.deleted", { targetType: "project", targetId: project._id });
  res.json({ ok: true });
});
