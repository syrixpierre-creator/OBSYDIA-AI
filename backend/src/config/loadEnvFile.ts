import fs from "node:fs";
import path from "node:path";

const candidates = [process.env.ENV_FILE, path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../.env")].filter(Boolean) as string[];
const file = candidates.find((f) => fs.existsSync(f));
if (file && process.env.NODE_ENV !== "test") process.loadEnvFile(file);
