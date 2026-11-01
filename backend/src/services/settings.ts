import { env } from "../config/env.js";
import { AdminSetting } from "../models/index.js";
import { applyOverrides, basePlans, type PlanDefinition, type PlanId, type PlanOverrides } from "../config/plans.js";

export interface AiSettings {
  displayName: string;
  personality: string;
  systemPrompt: string;
  welcomeMessage: string;
  welcomeMessageFr: string;
  welcomeSubtitle: { en: string; fr: string };
  suggestions: { en: string[]; fr: string[] };
  defaultLanguage: "auto" | "en" | "fr";
  provider: string;
  model: string;
  models: string[];
  capabilities: { vision: boolean; audio: boolean; tools: boolean };
  maxOutputTokens: number;
}

export function envAiSettings(): AiSettings {
  const e = env();
  const extra = e.XKIRO_MODELS.split(",").map((m) => m.trim()).filter(Boolean);
  return {
    displayName: e.AI_DISPLAY_NAME,
    personality: e.AI_PERSONALITY,
    systemPrompt: e.AI_SYSTEM_PROMPT,
    welcomeMessage: e.AI_WELCOME_MESSAGE,
    welcomeMessageFr: "Bienvenue sur OBSYDIA AI. Que souhaitez-vous créer aujourd'hui ?",
    welcomeSubtitle: { en: "Think. Create. Build. Deploy.", fr: "Pensez. Créez. Construisez. Déployez." },
    suggestions: {
      en: [
        "build: Build a responsive portfolio website with a dark theme",
        "Explain how JWT authentication works with an example",
        "Find the bug in my JavaScript function",
        "Plan a REST API for a task manager with Express and MongoDB"
      ],
      fr: [
        "build: Crée un site portfolio responsive au thème sombre",
        "Explique le fonctionnement de l'authentification JWT avec un exemple",
        "Trouve le bug dans ma fonction JavaScript",
        "Planifie une API REST de gestion de tâches avec Express et MongoDB"
      ]
    },
    defaultLanguage: e.AI_DEFAULT_LANGUAGE,
    provider: e.AI_PROVIDER,
    model: e.XKIRO_MODEL,
    models: Array.from(new Set([e.XKIRO_MODEL, ...extra])),
    capabilities: { vision: e.XKIRO_SUPPORTS_VISION, audio: e.XKIRO_SUPPORTS_AUDIO, tools: e.XKIRO_SUPPORTS_TOOLS },
    maxOutputTokens: e.AI_MAX_OUTPUT_TOKENS
  };
}

const cache = new Map<string, { value: unknown; at: number }>();
const TTL = 5000;

async function readSetting<T>(key: string): Promise<T | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as T | null;
  const doc = await AdminSetting.findOne({ key }).lean<any>();
  const value = doc ? (doc.value as T) : null;
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function writeSetting(key: string, value: unknown, userId?: unknown) {
  await AdminSetting.updateOne({ key }, { $set: { value, updatedBy: userId ?? null } }, { upsert: true });
  cache.delete(key);
}

export function clearSettingsCache() {
  cache.clear();
}

export async function getAiSettings(): Promise<AiSettings> {
  const base = envAiSettings();
  const overrides = (await readSetting<Partial<AiSettings>>("ai")) || {};
  const merged: AiSettings = { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined || v === null || v === "") continue;
    (merged as any)[k] = k === "capabilities" || k === "welcomeSubtitle" || k === "suggestions" ? { ...(base as any)[k], ...(v as object) } : v;
  }
  if (!merged.models.includes(merged.model)) merged.models = [merged.model, ...merged.models];
  return merged;
}

export async function getAiOverrides() {
  return (await readSetting<Partial<AiSettings>>("ai")) || {};
}

export async function getPlans(): Promise<Record<PlanId, PlanDefinition>> {
  const overrides = await readSetting<PlanOverrides>("plans");
  return applyOverrides(basePlans(), overrides || undefined);
}

export async function getPlan(id: string): Promise<PlanDefinition> {
  const plans = await getPlans();
  return plans[(id as PlanId) in plans ? (id as PlanId) : "free"];
}

export async function getPlanOverrides() {
  return (await readSetting<PlanOverrides>("plans")) || {};
}
