import fs from "node:fs";
import path from "node:path";
import yauzl from "yauzl";
import { env } from "../config/env.js";
import { badRequest } from "../lib/errors.js";

export type UploadKind = "image" | "zip" | "document" | "audio" | "code";

export const CODE_EXTENSIONS = new Set([
  ".txt", ".md", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".json", ".html", ".htm", ".css", ".scss", ".sass", ".less",
  ".py", ".rb", ".php", ".java", ".kt", ".go", ".rs", ".c", ".h", ".cpp", ".hpp", ".cs", ".swift", ".dart", ".vue", ".svelte",
  ".sql", ".sh", ".bash", ".yml", ".yaml", ".toml", ".ini", ".env.example", ".xml", ".svg", ".csv", ".graphql", ".prisma", ".dockerfile", ".gitignore", ".lua", ".r"
]);

const TEXT_NAMES = new Set(["dockerfile", "makefile", "procfile", "license", "readme", ".gitignore", ".dockerignore", ".npmrc", ".nvmrc", ".editorconfig", ".prettierrc", ".eslintrc", ".env.example"]);

export function sniff(buf: Buffer): { mime: string; kind: UploadKind } | null {
  const hex = buf.subarray(0, 12).toString("hex");
  const ascii = buf.subarray(0, 12).toString("latin1");
  if (hex.startsWith("89504e470d0a1a0a")) return { mime: "image/png", kind: "image" };
  if (hex.startsWith("ffd8ff")) return { mime: "image/jpeg", kind: "image" };
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return { mime: "image/webp", kind: "image" };
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WAVE") return { mime: "audio/wav", kind: "audio" };
  if (hex.startsWith("504b0304") || hex.startsWith("504b0506")) return { mime: "application/zip", kind: "zip" };
  if (ascii.startsWith("%PDF-")) return { mime: "application/pdf", kind: "document" };
  if (hex.startsWith("1a45dfa3")) return { mime: "audio/webm", kind: "audio" };
  if (ascii.startsWith("OggS")) return { mime: "audio/ogg", kind: "audio" };
  if (ascii.startsWith("ID3") || hex.startsWith("fffb") || hex.startsWith("fff3") || hex.startsWith("fff2")) return { mime: "audio/mpeg", kind: "audio" };
  if (ascii.slice(4, 8) === "ftyp") return { mime: "audio/mp4", kind: "audio" };
  return null;
}

export function isProbablyText(buf: Buffer) {
  const sample = buf.subarray(0, 8192);
  if (sample.includes(0)) return false;
  const decoded = sample.toString("utf8");
  const bad = (decoded.match(/�/g) || []).length;
  return bad <= Math.max(2, decoded.length * 0.01);
}

export function isTextName(name: string) {
  const base = path.basename(name).toLowerCase();
  if (TEXT_NAMES.has(base)) return true;
  if (base.endsWith(".env.example")) return true;
  return CODE_EXTENSIONS.has(path.extname(base));
}

export function detectUpload(originalName: string, head: Buffer): { mime: string; kind: UploadKind } {
  const sniffed = sniff(head);
  if (sniffed) return sniffed;
  if (isTextName(originalName) && isProbablyText(head)) {
    const ext = path.extname(originalName).toLowerCase();
    return { mime: ext === ".txt" || ext === ".md" ? "text/plain" : "text/x-source", kind: ext === ".txt" || ext === ".md" ? "document" : "code" };
  }
  throw badRequest("unsupported_file_type", "This file type is not supported");
}

export function safeRelativePath(input: string): string | null {
  const unified = input.replace(/\\/g, "/");
  if (unified.includes("\0")) return null;
  if (unified.startsWith("/") || /^[a-zA-Z]:/.test(unified)) return null;
  const parts = unified.split("/").filter((p) => p && p !== ".");
  if (!parts.length || parts.some((p) => p === "..")) return null;
  if (parts.some((p) => p.length > 200)) return null;
  const joined = parts.join("/");
  return joined.length > 400 ? null : joined;
}

const SKIP_DIRS = ["node_modules/", ".git/", "dist/", "build/", ".next/", "__pycache__/", ".venv/", "venv/", ".cache/", "coverage/"];

export interface ZipEntryInfo {
  path: string;
  size: number;
  text: string | null;
  binary: boolean;
  skipped?: string;
}

export interface ZipInspection {
  entries: ZipEntryInfo[];
  totalUncompressed: number;
  fileCount: number;
  skipped: number;
  rootPrefix: string | null;
  technologies: string[];
}

export async function inspectZip(
  filePath: string,
  opts: { maxEntries?: number; maxTotalBytes?: number; maxFileBytes?: number; maxRatio?: number } = {}
): Promise<ZipInspection> {
  const e = env();
  const maxEntries = opts.maxEntries ?? e.MAX_ZIP_ENTRIES;
  const maxTotal = opts.maxTotalBytes ?? e.MAX_ZIP_UNCOMPRESSED_MB * 1024 * 1024;
  const maxFile = opts.maxFileBytes ?? 2 * 1024 * 1024;
  const maxRatio = opts.maxRatio ?? 200;

  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.open(filePath, { lazyEntries: true, autoClose: true, strictFileNames: false, validateEntrySizes: true }, (err, z) =>
      err || !z ? reject(badRequest("invalid_zip", "The archive is corrupted or not a ZIP file")) : resolve(z)
    )
  );
  if (zip.entryCount > maxEntries) {
    zip.close();
    throw badRequest("zip_too_many_entries", `The archive contains more than ${maxEntries} entries`);
  }

  const entries: ZipEntryInfo[] = [];
  let total = 0;
  let skipped = 0;

  await new Promise<void>((resolve, reject) => {
    const fail = (err: Error) => {
      try {
        zip.close();
      } catch {}
      reject(err);
    };
    zip.on("error", () => fail(badRequest("invalid_zip", "The archive could not be read")));
    zip.on("end", () => resolve());
    zip.on("entry", (entry: yauzl.Entry) => {
      const name = entry.fileName;
      if (name.endsWith("/")) return zip.readEntry();
      const rel = safeRelativePath(name);
      if (!rel) return fail(badRequest("zip_path_traversal", "The archive contains unsafe file paths"));
      const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
      if (mode === 0o120000) return fail(badRequest("zip_symlink", "The archive contains symbolic links"));
      if (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > maxRatio && entry.uncompressedSize > 1024 * 1024) {
        return fail(badRequest("zip_bomb", "The archive has a suspicious compression ratio"));
      }
      total += entry.uncompressedSize;
      if (total > maxTotal) return fail(badRequest("zip_too_large", "The archive is too large once extracted"));
      const lowered = `${rel.toLowerCase()}`;
      if (SKIP_DIRS.some((d) => lowered.startsWith(d) || lowered.includes(`/${d}`)) || lowered.startsWith("__macosx/")) {
        skipped++;
        return zip.readEntry();
      }
      if (entry.uncompressedSize > maxFile) {
        entries.push({ path: rel, size: entry.uncompressedSize, text: null, binary: true, skipped: "too_large" });
        return zip.readEntry();
      }
      zip.openReadStream(entry, (err, stream) => {
        if (err || !stream) return fail(badRequest("invalid_zip", "An archive entry could not be read"));
        const chunks: Buffer[] = [];
        let read = 0;
        stream.on("data", (c: Buffer) => {
          read += c.length;
          if (read > maxFile || read > entry.uncompressedSize + 1) {
            stream.destroy();
            return fail(badRequest("zip_bomb", "An archive entry expands beyond its declared size"));
          }
          chunks.push(c);
        });
        stream.on("error", () => fail(badRequest("invalid_zip", "An archive entry is corrupted")));
        stream.on("end", () => {
          const buf = Buffer.concat(chunks);
          const textual = isProbablyText(buf) && (isTextName(rel) || buf.length < 256 * 1024);
          entries.push({
            path: rel,
            size: buf.length,
            text: textual ? buf.toString("utf8") : null,
            binary: !textual
          });
          if (!textual) (entries[entries.length - 1] as any).base64 = buf.length <= 512 * 1024 ? buf.toString("base64") : null;
          zip.readEntry();
        });
      });
    });
    zip.readEntry();
  });

  const tops = new Set(entries.map((x) => x.path.split("/")[0]));
  const rootPrefix = tops.size === 1 && entries.every((x) => x.path.includes("/")) ? `${[...tops][0]}/` : null;
  if (rootPrefix) for (const x of entries) x.path = x.path.slice(rootPrefix.length);

  return { entries, totalUncompressed: total, fileCount: entries.length, skipped, rootPrefix, technologies: detectTechnologies(entries) };
}

export function detectTechnologies(entries: { path: string; text?: string | null }[]) {
  const tech = new Set<string>();
  const has = (p: RegExp) => entries.some((e) => p.test(e.path));
  const pkg = entries.find((e) => e.path === "package.json")?.text;
  if (pkg) {
    tech.add("Node.js");
    try {
      const json = JSON.parse(pkg);
      const deps = { ...(json.dependencies || {}), ...(json.devDependencies || {}) };
      const map: Record<string, string> = {
        next: "Next.js", react: "React", vue: "Vue", svelte: "Svelte", express: "Express", typescript: "TypeScript",
        tailwindcss: "Tailwind CSS", vite: "Vite", mongoose: "MongoDB (Mongoose)", "@nestjs/core": "NestJS", prisma: "Prisma", angular: "Angular", "@angular/core": "Angular"
      };
      for (const [dep, name] of Object.entries(map)) if (deps[dep]) tech.add(name);
    } catch {}
  }
  if (has(/\.tsx?$/)) tech.add("TypeScript");
  if (has(/\.py$/)) tech.add("Python");
  if (has(/requirements\.txt$|pyproject\.toml$/)) tech.add("Python packaging");
  if (has(/\.html?$/)) tech.add("HTML");
  if (has(/\.css$/)) tech.add("CSS");
  if (has(/\.php$/)) tech.add("PHP");
  if (has(/\.go$/)) tech.add("Go");
  if (has(/\.rs$/)) tech.add("Rust");
  if (has(/\.java$/)) tech.add("Java");
  if (has(/(^|\/)Dockerfile$/i)) tech.add("Docker");
  return [...tech];
}

export async function extractPdfText(filePath: string, maxChars = 120_000) {
  const mod: any = await import("pdf-parse/lib/pdf-parse.js" as string);
  const parse = mod.default || mod;
  const data = await parse(fs.readFileSync(filePath), { max: 200 });
  return String(data.text || "").replace(/\n{3,}/g, "\n\n").slice(0, maxChars);
}

export function readTextFile(filePath: string, maxChars = 120_000) {
  return fs.readFileSync(filePath, "utf8").slice(0, maxChars);
}

export function zipSummary(z: ZipInspection, maxChars = 60_000) {
  const tree = z.entries.map((e) => `${e.path} (${e.size} B${e.binary ? ", binary" : ""})`).join("\n");
  let out = `Archive summary\nFiles: ${z.fileCount} (skipped ${z.skipped} dependency/build files)\nTechnologies: ${z.technologies.join(", ") || "unknown"}\n\nFile tree:\n${tree}\n`;
  const priority = (p: string) =>
    /(^|\/)(package\.json|readme\.md|index\.html|requirements\.txt|tsconfig\.json|vite\.config|next\.config|server\.(js|ts)|app\.(js|ts|py)|main\.(js|ts|py))/i.test(p) ? 0 : 1;
  const textual = z.entries.filter((e) => e.text !== null).sort((a, b) => priority(a.path) - priority(b.path) || a.size - b.size);
  for (const e of textual) {
    const block = `\n--- ${e.path} ---\n${e.text}\n`;
    if (out.length + block.length > maxChars) {
      out += `\n[Additional files omitted to stay within context limits]\n`;
      break;
    }
    out += block;
  }
  return out;
}
