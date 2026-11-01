import * as acorn from "acorn";
import path from "node:path";

export interface ValidationResult {
  ok: boolean;
  issues: string[];
}

function checkJs(p: string, content: string): string | null {
  for (const sourceType of ["module", "script"] as const) {
    try {
      acorn.parse(content, { ecmaVersion: "latest", sourceType, allowHashBang: true, allowReturnOutsideFunction: sourceType === "script" });
      return null;
    } catch (err) {
      if (sourceType === "script") return `${p}: JavaScript syntax error — ${(err as Error).message}`;
    }
  }
  return null;
}

export function validateProjectFiles(files: { path: string; content: string; encoding?: string }[]): ValidationResult {
  const issues: string[] = [];
  const paths = new Set(files.map((f) => f.path));
  for (const f of files) {
    if (f.encoding === "base64") continue;
    const ext = path.extname(f.path).toLowerCase();
    if (ext === ".json") {
      try {
        JSON.parse(f.content);
      } catch (err) {
        if (!/tsconfig|jsconfig|\.vscode/.test(f.path)) issues.push(`${f.path}: invalid JSON — ${(err as Error).message}`);
      }
    } else if (ext === ".js" || ext === ".mjs" || ext === ".cjs") {
      const e = checkJs(f.path, f.content);
      if (e) issues.push(e);
    } else if (ext === ".html" || ext === ".htm") {
      const dir = path.posix.dirname(f.path);
      const refs = [...f.content.matchAll(/(?:src|href)\s*=\s*["']([^"'#?]+)(?:[?#][^"']*)?["']/gi)].map((m) => m[1]!);
      for (const ref of refs) {
        if (/^(?:[a-z]+:|\/\/|data:|mailto:|tel:|#|\{)/i.test(ref) || ref.startsWith("/")) continue;
        const resolved = path.posix.normalize(path.posix.join(dir === "." ? "" : dir, ref));
        if (!/\.[a-z0-9]+$/i.test(resolved)) continue;
        if (!paths.has(resolved)) issues.push(`${f.path}: references missing file "${ref}"`);
      }
    }
    if (/\.\.\.\s*(rest of|remaining|existing) (the )?code|TODO: implement|\/\/ \.\.\.$/im.test(f.content)) {
      issues.push(`${f.path}: contains an incomplete placeholder`);
    }
  }
  const pkg = files.find((f) => f.path === "package.json");
  if (pkg) {
    try {
      const json = JSON.parse(pkg.content);
      if (!json.name) issues.push("package.json: missing \"name\"");
    } catch {}
  }
  return { ok: issues.length === 0, issues: Array.from(new Set(issues)).slice(0, 50) };
}

export function findPreviewEntry(paths: string[]): string | null {
  const order = ["index.html", "preview/index.html", "public/index.html", "dist/index.html", "src/index.html", "frontend/index.html", "client/index.html"];
  for (const p of order) if (paths.includes(p)) return p;
  const any = paths.find((p) => p.endsWith("/index.html") && p.split("/").length <= 3);
  return any || null;
}
