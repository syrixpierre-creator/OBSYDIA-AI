import { safeRelativePath } from "../files.js";

export interface ParsedFiles {
  files: { path: string; content: string }[];
  deletes: string[];
}

const FORBIDDEN = [/^\.env$/i, /^\.env\.(?!example$).+/i, /(^|\/)\.git\//, /(^|\/)node_modules\//];

export function isForbiddenPath(p: string) {
  const base = p.split("/").pop() || p;
  return FORBIDDEN.some((r) => r.test(p) || r.test(base));
}

function stripFence(content: string) {
  const trimmed = content.replace(/^\n+/, "").replace(/\s+$/, "");
  const m = trimmed.match(/^```[\w.+-]*\n([\s\S]*?)\n```$/);
  return (m ? m[1]! : trimmed) + "\n";
}

export function parseFileBlocks(text: string): ParsedFiles {
  const files: { path: string; content: string }[] = [];
  const deletes: string[] = [];
  const re = /<<<FILE:\s*([^\n>]+?)\s*>>>\n([\s\S]*?)\n?<<<END FILE>>>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const p = safeRelativePath(m[1]!.trim());
    if (!p || isForbiddenPath(p)) continue;
    const existing = files.findIndex((f) => f.path === p);
    const entry = { path: p, content: stripFence(m[2]!) };
    if (existing >= 0) files[existing] = entry;
    else files.push(entry);
  }
  const del = /<<<DELETE:\s*([^\n>]+?)\s*>>>/g;
  while ((m = del.exec(text))) {
    const p = safeRelativePath(m[1]!.trim());
    if (p) deletes.push(p);
  }
  return { files, deletes };
}

export function extractJson<T = any>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  const candidates = [fenced?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try {
      return JSON.parse(c.slice(start, end + 1)) as T;
    } catch {}
  }
  return null;
}

export const FILE_FORMAT_INSTRUCTIONS = `Output format (mandatory):
For every file you create or change, output exactly:
<<<FILE: relative/path/to/file.ext>>>
<complete file content>
<<<END FILE>>>
To delete a file, output: <<<DELETE: relative/path>>>
Rules: always output complete file contents, never partial diffs or placeholders like "rest of code here". Use forward slashes and relative paths. Never output .env files with real secrets; use .env.example with placeholder values. Do not wrap the blocks in Markdown fences. You may write one short sentence before the first block.`;
