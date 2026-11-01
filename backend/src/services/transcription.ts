import fs from "node:fs";
import OpenAI, { toFile } from "openai";
import { env } from "../config/env.js";
import { AppError, unavailable } from "../lib/errors.js";
import { providerManager } from "./ai/providerManager.js";
import { getAiSettings } from "./settings.js";

export async function transcriptionAvailable() {
  const e = env();
  if (e.TRANSCRIPTION_BASE_URL && e.TRANSCRIPTION_API_KEY) return true;
  const s = await getAiSettings();
  return s.capabilities.audio;
}

export async function transcribe(filePath: string, filename: string, mime: string, language?: string) {
  const e = env();
  let client: OpenAI;
  let model = e.TRANSCRIPTION_MODEL;
  if (e.TRANSCRIPTION_BASE_URL && e.TRANSCRIPTION_API_KEY) {
    client = new OpenAI({ apiKey: e.TRANSCRIPTION_API_KEY, baseURL: e.TRANSCRIPTION_BASE_URL, timeout: 120_000, maxRetries: 1 });
  } else {
    const settings = await getAiSettings();
    if (!settings.capabilities.audio) throw unavailable("transcription_unavailable", "No transcription provider is configured");
    await providerManager.refresh();
    const key = providerManager.pick();
    if (!key) throw unavailable("provider_unavailable", "No provider key is available");
    client = new OpenAI({ apiKey: key.secret, baseURL: e.XKIRO_BASE_URL, timeout: 120_000, maxRetries: 1 });
    model = settings.model;
  }
  try {
    const file = await toFile(fs.createReadStream(filePath), filename, { type: mime });
    const res: any = await client.audio.transcriptions.create({ file, model, ...(language && language !== "auto" ? { language } : {}) } as any);
    const text = String(res?.text ?? "").trim();
    if (!text) throw new AppError(422, "transcription_empty", "No speech was detected in the recording");
    return text;
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError(502, "transcription_failed", String(err?.message || "Transcription failed").slice(0, 200));
  }
}
