import fs from "node:fs";
import { Router } from "express";
import { z } from "zod";
import { Project, ProjectFile, UploadedFile } from "../models/index.js";
import { requireVerified } from "../middleware/auth.js";
import { body, objectId, parse } from "../lib/validate.js";
import { AppError, badRequest, forbidden, notFound } from "../lib/errors.js";
import { dataDir } from "../lib/storage.js";
import { multerLimits, presentFile, processUpload } from "../services/uploads.js";
import { inspectZip } from "../services/files.js";
import { transcribe, transcriptionAvailable } from "../services/transcription.js";
import { getPlan } from "../services/settings.js";
import { refreshProjectStats, buildArtifact } from "../services/artifacts.js";
import { isForbiddenPath } from "../services/projects/fileFormat.js";
import { limiter } from "../lib/rateLimit.js";

export const filesRouter = Router();
filesRouter.use(requireVerified);

const uploadLimiter = limiter("upload", { windowMs: 60_000, limit: 20, keyGenerator: (req) => String((req as any).user?._id) });

filesRouter.post("/", uploadLimiter, (req, res, next) => multerLimits().single("file")(req, res, next), async (req, res) => {
  if (!req.file) throw badRequest("file_required", "No file was uploaded");
  const doc = await processUpload(req.user, req.file, "app");
  res.status(201).json({ file: presentFile(doc) });
});

filesRouter.get("/", async (req, res) => {
  const files = await UploadedFile.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100).lean<any[]>();
  res.json({ files: files.map(presentFile) });
});

filesRouter.get("/:id/content", async (req, res) => {
  const f = await UploadedFile.findOne({ _id: parse(objectId, String(req.params.id)), userId: req.user._id }).lean<any>();
  if (!f) throw notFound("file_not_found");
  const p = dataDir(f.storagePath);
  if (!fs.existsSync(p)) throw notFound("file_missing");
  res.setHeader("Content-Type", f.mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("Content-Disposition", `${f.kind === "image" ? "inline" : "attachment"}; filename="${encodeURIComponent(f.originalName)}"`);
  fs.createReadStream(p).pipe(res);
});

filesRouter.delete("/:id", async (req, res) => {
  const f = await UploadedFile.findOneAndDelete({ _id: parse(objectId, String(req.params.id)), userId: req.user._id }).lean<any>();
  if (!f) throw notFound("file_not_found");
  fs.rmSync(dataDir(f.storagePath), { force: true });
  res.json({ ok: true });
});

filesRouter.post("/:id/import-project", async (req, res) => {
  const f = await UploadedFile.findOne({ _id: parse(objectId, String(req.params.id)), userId: req.user._id }).lean<any>();
  if (!f) throw notFound("file_not_found");
  if (f.kind !== "zip") throw badRequest("not_a_zip", "Only ZIP archives can be imported as projects");
  const input = body(req, z.object({ name: z.string().trim().min(1).max(120).optional(), conversationId: objectId.optional() }));
  const z0 = await inspectZip(dataDir(f.storagePath));
  const files = z0.entries.filter((e) => !isForbiddenPath(e.path) && (e.text !== null || (e as any).base64));
  if (!files.length) throw badRequest("project_empty", "The archive contains no importable files");
  const project = await Project.create({
    userId: req.user._id,
    name: input.name || f.originalName.replace(/\.zip$/i, ""),
    description: `Imported from ${f.originalName}`,
    stack: z0.technologies,
    status: "ready",
    source: "upload",
    conversationId: input.conversationId || null
  });
  await ProjectFile.insertMany(
    files.map((e) => ({
      projectId: project._id,
      path: e.path,
      content: e.text !== null ? e.text : (e as any).base64,
      encoding: e.text !== null ? "utf8" : "base64",
      size: e.size,
      updatedBy: "upload"
    }))
  );
  await refreshProjectStats(project._id);
  await buildArtifact(project._id, `Imported from ${f.originalName}`);
  res.status(201).json({ projectId: String(project._id), fileCount: files.length, technologies: z0.technologies });
});

filesRouter.get("/transcription/status", async (_req, res) => {
  res.json({ available: await transcriptionAvailable() });
});

filesRouter.post("/transcribe", uploadLimiter, (req, res, next) => multerLimits().single("audio")(req, res, next), async (req, res) => {
  if (!req.file) throw badRequest("file_required", "No audio was uploaded");
  try {
    const plan = await getPlan(req.user.plan);
    if (!plan.voiceInput) throw forbidden("plan_upgrade_required", "Voice input requires the Pro or Premium plan");
    const doc = await processUpload(req.user, req.file, "app", ["audio"]);
    try {
      const text = await transcribe(dataDir(doc.storagePath), doc.originalName, doc.mime, String(req.body?.language || "") || undefined);
      res.json({ text });
    } finally {
      fs.rmSync(dataDir(doc.storagePath), { force: true });
      await UploadedFile.deleteOne({ _id: doc._id });
    }
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.rmSync(req.file.path, { force: true });
    throw err instanceof AppError ? err : new AppError(500, "transcription_failed", (err as Error).message);
  }
});
