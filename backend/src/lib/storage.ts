import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";

export function dataDir(...parts: string[]) {
  const root = path.resolve(env().DATA_DIR);
  const target = path.resolve(root, ...parts);
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error("Path escapes data directory");
  return target;
}

export function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function ensureDataDirs() {
  for (const d of ["uploads", "artifacts", "tmp"]) ensureDir(dataDir(d));
}
