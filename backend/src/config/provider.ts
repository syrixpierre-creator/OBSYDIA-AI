import { env } from "./env.js";

export interface ProviderConfig {
  name: string;
  label: string;
  baseURL: string;
  model: string;
  models: string[];
  keys: string[];
  timeoutMs: number;
  maxRetries: number;
  capabilities: { vision: boolean; audio: boolean; tools: boolean };
  extraBody: Record<string, unknown>;
  maxOutputCap: number;
}

const PRESETS: Record<string, { label: string; baseURL: string; model: string; extraBody: Record<string, unknown>; capabilities: { vision: boolean; audio: boolean; tools: boolean } }> = {
  deepseek: {
    label: "DeepSeek",
    baseURL: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    extraBody: { thinking: { type: "disabled" } },
    capabilities: { vision: false, audio: false, tools: true }
  },
  xkiro: {
    label: "XKIRO",
    baseURL: "https://api.xkiro.com/v1",
    model: "qwen/qwen3.8-omni-flash:free",
    extraBody: {},
    capabilities: { vision: false, audio: false, tools: false }
  }
};

function flag(primary: string, fallback: boolean | undefined, preset: boolean) {
  if (primary !== "") return ["true", "1", "yes"].includes(primary.toLowerCase());
  if (fallback !== undefined) return fallback;
  return preset;
}

function num(primary: string, fallback: number) {
  const n = Number(primary);
  return primary !== "" && Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function providerConfig(): ProviderConfig {
  const e = env();
  const name = e.AI_PROVIDER || "deepseek";
  const preset = PRESETS[name] || { label: name, baseURL: "", model: "", extraBody: {}, capabilities: { vision: false, audio: false, tools: false } };
  const legacy = name === "xkiro";
  const baseURL = e.AI_BASE_URL || (legacy ? e.XKIRO_BASE_URL : preset.baseURL);
  const model = e.AI_MODEL || (legacy ? e.XKIRO_MODEL : preset.model);
  const extra = [e.AI_MODELS, legacy ? e.XKIRO_MODELS : ""].join(",").split(",").map((m) => m.trim()).filter(Boolean);
  const keys = Array.from(new Set([...e.AI_API_KEYS, ...(legacy ? e.XKIRO_API_KEYS : [])]));
  return {
    name,
    label: preset.label,
    baseURL,
    model,
    models: Array.from(new Set([model, ...extra])),
    keys,
    timeoutMs: num(e.AI_TIMEOUT_MS, e.XKIRO_TIMEOUT_MS),
    maxRetries: num(e.AI_MAX_RETRIES, e.XKIRO_MAX_RETRIES),
    capabilities: {
      vision: flag(e.AI_SUPPORTS_VISION, legacy ? e.XKIRO_SUPPORTS_VISION : undefined, preset.capabilities.vision),
      audio: flag(e.AI_SUPPORTS_AUDIO, legacy ? e.XKIRO_SUPPORTS_AUDIO : undefined, preset.capabilities.audio),
      tools: flag(e.AI_SUPPORTS_TOOLS, legacy ? e.XKIRO_SUPPORTS_TOOLS : undefined, preset.capabilities.tools)
    },
    extraBody: e.AI_EXTRA_BODY ?? preset.extraBody,
    maxOutputCap: e.AI_MAX_OUTPUT_CAP
  };
}

export function keyFingerprint(secret: string) {
  return `${providerConfig().name}:${secret}`;
}
