import path from "node:path";
import { Router } from "express";
import { Project, ProjectFile } from "../models/index.js";
import { verifyPayload } from "../lib/crypto.js";
import { safeRelativePath } from "../services/files.js";
import { env } from "../config/env.js";

export const previewRouter = Router();

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".wasm": "application/wasm"
};

function sandboxCsp(origin: string) {
  return [
  "sandbox allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock",
  `default-src ${origin} https: data: blob:`,
  `script-src ${origin} 'unsafe-inline' 'unsafe-eval' https: blob:`,
  `style-src ${origin} 'unsafe-inline' https:`,
  `img-src ${origin} https: data: blob:`,
  `font-src ${origin} https: data:`,
  "connect-src https: wss:",
  `frame-ancestors ${new URL(env().APP_URL).origin} ${origin}`,
  "form-action 'none'",
  `base-uri ${origin}`
].join("; ");
}

previewRouter.get("/:token/*splat", async (req, res) => {
  const data = verifyPayload<{ p: string }>(String(req.params.token), "preview");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cache-Control", "no-store");
  if (!data) {
    res.status(410).type("text/plain").send("This preview link has expired. Refresh the preview from OBSYDIA AI.");
    return;
  }
  const project = await Project.findById(data.p).lean<any>();
  if (!project) {
    res.status(404).type("text/plain").send("Project not found");
    return;
  }
  const splat = (req.params as any).splat;
  const raw = Array.isArray(splat) ? splat.join("/") : String(splat || "");
  let rel = safeRelativePath(decodeURIComponent(raw)) || project.entry;
  let file = await ProjectFile.findOne({ projectId: project._id, path: rel }).lean<any>();
  if (!file && !path.extname(rel)) {
    rel = `${rel.replace(/\/$/, "")}/index.html`;
    file = await ProjectFile.findOne({ projectId: project._id, path: rel }).lean<any>();
  }
  if (!file) {
    res.status(404).type("text/plain").send(`File not found in project: ${rel}`);
    return;
  }
  const ext = path.extname(rel).toLowerCase();
  res.setHeader("Content-Security-Policy", sandboxCsp(`${req.protocol}://${req.get("host")}`));
  res.removeHeader("X-Frame-Options");
  res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
  res.send(file.encoding === "base64" ? Buffer.from(file.content, "base64") : file.content);
});
