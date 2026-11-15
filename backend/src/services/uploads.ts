import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { env } from "../config/env.js";
import { dataDir, ensureDir } from "../lib/storage.js";
import { AppError, forbidden } from "../lib/errors.js";
import { UploadedFile } from "../models/index.js";
import { detectUpload, extractPdfText, inspectZip, readTextFile, zipSummary } from "./files.js";
import { getPlan } from "./settings.js";


export function multerLimits() {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, ensureDir(dataDir("tmp"))),
      filename: (_req, _file, cb) => cb(null, crypto.randomBytes(16).toString("hex"))
    }),
    limits: { fileSize: env().MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 10 }
  });
}

function readHead(p: string) {
  const fd = fs.openSync(p, "r");
  const buf = Buffer.alloc(8192);
  const n = fs.readSync(fd, buf, 0, 8192, 0);
  fs.closeSync(fd);
  return buf.subarray(0, n);
}

function sha256File(p: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

export function cleanName(name: string) {
  const base = path.basename(Buffer.from(name, "latin1").toString("utf8")).replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_").trim();
  return (base || "file").slice(0, 160);
}

export async function processUpload(user: any, file: Express.Multer.File, via: "app" | "api", allowed?: string[]) {
  const tmp = file.path;
  try {
    const plan = await getPlan(user.plan);
    if (file.size > plan.maxUploadMb * 1024 * 1024) {
      throw new AppError(413, "file_too_large", `Your plan allows files up to ${plan.maxUploadMb} MB`);
    }
    if (file.size === 0) throw new AppError(400, "empty_file", "The file is empty");
    const name = cleanName(file.originalname);
    const detected = detectUpload(name, readHead(tmp));
    if (allowed && !allowed.includes(detected.kind)) throw new AppError(400, "unsupported_file_type", "This file type is not accepted here");
    if (detected.kind === "zip" && !plan.zipUploads) throw forbidden("plan_upgrade_required", "ZIP uploads require the Pro or Premium plan");
    if (detected.kind === "audio" && !plan.voiceInput) throw forbidden("plan_upgrade_required", "Voice input requires the Pro or Premium plan");

    let extractedText = "";
    let analysis: Record<string, unknown> | null = null;
    if (detected.kind === "document") {
      extractedText = detected.mime === "application/pdf" ? await extractPdfText(tmp).catch(() => {
        throw new AppError(422, "pdf_unreadable", "The PDF could not be read");
      }) : readTextFile(tmp);
      analysis = { chars: extractedText.length };
    } else if (detected.kind === "code") {
      extractedText = "```" + path.extname(name).slice(1) + "\n" + readTextFile(tmp) + "\n```";
      analysis = { chars: extractedText.length };
    } else if (detected.kind === "zip") {
      const z = await inspectZip(tmp);
      extractedText = zipSummary(z);
      analysis = {
        fileCount: z.fileCount,
        skipped: z.skipped,
        totalUncompressed: z.totalUncompressed,
        technologies: z.technologies,
        tree: z.entries.slice(0, 400).map((e) => e.path)
      };
    }

    const id = crypto.randomBytes(12).toString("hex");
    const relative = path.join("uploads", String(user._id), id);
    ensureDir(path.dirname(dataDir(relative)));
    fs.renameSync(tmp, dataDir(relative));
    const doc = await UploadedFile.create({
      userId: user._id,
      kind: detected.kind,
      originalName: name,
      mime: detected.mime,
      size: file.size,
      storagePath: relative,
      sha256: sha256File(dataDir(relative)),
      extractedText,
      analysis,
      via
    });
    return doc;
  } finally {
    if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
  }
}

export function presentFile(f: any) {
  return {
    id: String(f._id),
    kind: f.kind,
    name: f.originalName,
    mime: f.mime,
    size: f.size,
    analysis: f.analysis,
    createdAt: f.createdAt
  };
}
