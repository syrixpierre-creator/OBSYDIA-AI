import archiver from "archiver";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Artifact, ArtifactVersion, Project, ProjectFile } from "../models/index.js";
import { dataDir, ensureDir } from "../lib/storage.js";
import { AppError } from "../lib/errors.js";
import { isForbiddenPath } from "./projects/fileFormat.js";

export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 60) || "project"
  );
}

export async function writeZip(target: string, rootName: string, files: { path: string; content: string; encoding?: string }[]) {
  ensureDir(path.dirname(target));
  const tmp = `${target}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(tmp);
    const archive = archiver("zip", { zlib: { level: 9 } });
    out.on("close", () => resolve());
    out.on("error", reject);
    archive.on("error", reject);
    archive.pipe(out);
    for (const f of files) {
      const data = f.encoding === "base64" ? Buffer.from(f.content, "base64") : Buffer.from(f.content, "utf8");
      archive.append(data, { name: `${rootName}/${f.path}`, date: new Date("2025-01-01T00:00:00Z"), mode: 0o644 });
    }
    void archive.finalize();
  });
  fs.renameSync(tmp, target);
  const buf = fs.readFileSync(target);
  return { size: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") };
}

export async function buildArtifact(projectId: unknown, note = "") {
  const project = await Project.findById(projectId);
  if (!project) throw new AppError(404, "project_not_found");
  const files = await ProjectFile.find({ projectId: project._id }).sort({ path: 1 }).lean<any[]>();
  const included = files.filter((f) => !isForbiddenPath(f.path));
  if (!included.length) throw new AppError(422, "project_empty", "The project has no files to package");

  let artifact = await Artifact.findOne({ projectId: project._id });
  if (!artifact) artifact = await Artifact.create({ userId: project.userId, projectId: project._id, name: project.name, status: "building" });
  else await Artifact.updateOne({ _id: artifact._id }, { $set: { status: "building", name: project.name } });

  const bumped = await Artifact.findOneAndUpdate({ _id: artifact._id }, { $inc: { latestVersion: 1 } }, { new: true }).lean<any>();
  const version = bumped.latestVersion as number;
  const relative = path.join("artifacts", String(project._id), `v${version}.zip`);
  try {
    const { size, sha256 } = await writeZip(dataDir(relative), slugify(project.name), included);
    const doc = await ArtifactVersion.create({
      artifactId: artifact._id,
      projectId: project._id,
      userId: project.userId,
      version,
      storagePath: relative,
      sizeBytes: size,
      fileCount: included.length,
      sha256,
      note,
      snapshot: included.map((f) => ({ path: f.path, content: f.content, encoding: f.encoding }))
    });
    await Artifact.updateOne({ _id: artifact._id }, { $set: { status: "ready", lastError: null } });
    await Project.updateOne({ _id: project._id }, { $set: { currentVersion: version } });
    return { artifactId: String(artifact._id), version, versionId: String(doc._id), sizeBytes: size, fileCount: included.length, sha256 };
  } catch (err) {
    await Artifact.updateOne({ _id: artifact._id }, { $set: { status: "error", lastError: (err as Error).message.slice(0, 300) } });
    throw err;
  }
}

export async function restoreVersion(projectId: unknown, version: number) {
  const v = await ArtifactVersion.findOne({ projectId, version }).select("+snapshot").lean<any>();
  if (!v) throw new AppError(404, "version_not_found");
  await ProjectFile.deleteMany({ projectId });
  if (v.snapshot.length) {
    await ProjectFile.insertMany(
      v.snapshot.map((f: any) => ({
        projectId,
        path: f.path,
        content: f.content,
        encoding: f.encoding || "utf8",
        size: f.encoding === "base64" ? Buffer.from(f.content, "base64").length : Buffer.byteLength(f.content),
        updatedBy: "user"
      }))
    );
  }
  await refreshProjectStats(projectId);
  return buildArtifact(projectId, `Restored from v${version}`);
}

export async function refreshProjectStats(projectId: unknown) {
  const files = await ProjectFile.find({ projectId }).select("path size").lean<any[]>();
  const { findPreviewEntry } = await import("./projects/validate.js");
  const entry = findPreviewEntry(files.map((f) => f.path));
  await Project.updateOne(
    { _id: projectId },
    {
      $set: {
        fileCount: files.length,
        totalBytes: files.reduce((s, f) => s + (f.size || 0), 0),
        previewable: Boolean(entry),
        entry: entry || "index.html"
      }
    }
  );
}

export function artifactFilePath(storagePath: string) {
  return dataDir(storagePath);
}
