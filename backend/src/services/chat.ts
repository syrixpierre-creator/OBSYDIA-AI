import fs from "node:fs";
import { Message, UploadedFile } from "../models/index.js";
import { dataDir } from "../lib/storage.js";
import { AppError } from "../lib/errors.js";
import { env } from "../config/env.js";
import { buildSystemPrompt, detectLanguage } from "./ai/prompt.js";
import type { ChatContentPart, ChatMessage } from "./ai/providerManager.js";
import type { AiSettings } from "./settings.js";

export async function resolveAttachments(userId: unknown, fileIds: string[]) {
  if (!fileIds.length) return [];
  const files = await UploadedFile.find({ _id: { $in: fileIds }, userId }).lean<any[]>();
  if (files.length !== new Set(fileIds).size) throw new AppError(404, "file_not_found", "One or more attachments were not found");
  return files.map((f) => ({ fileId: f._id, kind: f.kind, name: f.originalName, mime: f.mime, size: f.size }));
}

export async function messageToModel(m: any, userId: unknown, settings: AiSettings): Promise<ChatMessage> {
  if (!m.attachments?.length) return { role: m.role, content: m.content };
  const ids = m.attachments.map((a: any) => a.fileId);
  const files = await UploadedFile.find({ _id: { $in: ids }, userId }).select("+extractedText").lean<any[]>();
  const parts: ChatContentPart[] = [];
  let textPrefix = "";
  for (const f of files) {
    if (f.kind === "image") {
      if (!settings.capabilities.vision) {
        throw new AppError(422, "vision_not_supported", "The current model does not support image understanding");
      }
      const p = dataDir(f.storagePath);
      if (!fs.existsSync(p)) continue;
      parts.push({ type: "image_url", image_url: { url: `data:${f.mime};base64,${fs.readFileSync(p).toString("base64")}` } });
    } else if (f.extractedText) {
      const label = f.kind === "zip" ? "Uploaded ZIP project" : "Attached file";
      textPrefix += `[${label}: ${f.originalName}]\n${f.extractedText}\n[End of ${f.originalName}]\n\n`;
    } else if (f.kind === "audio") {
      textPrefix += `[Audio attachment ${f.originalName} — no transcript available]\n\n`;
    }
  }
  const text = `${textPrefix}${m.content}`;
  if (!parts.length) return { role: m.role, content: text };
  return { role: m.role, content: [{ type: "text", text }, ...parts] };
}

export async function buildContext(opts: {
  conversationId: unknown;
  userId: unknown;
  beforeDate?: Date;
  excludeId?: unknown;
  settings: AiSettings;
  user: any;
  extraUserMessage?: any;
}) {
  const filter: Record<string, unknown> = { conversationId: opts.conversationId, status: { $ne: "error" } };
  if (opts.beforeDate) filter.createdAt = { $lte: opts.beforeDate };
  if (opts.excludeId) filter._id = { $ne: opts.excludeId };
  const history = await Message.find(filter)
    .sort({ createdAt: -1 })
    .limit(env().AI_CONTEXT_MESSAGES)
    .lean<any[]>();
  history.reverse();
  const items = opts.extraUserMessage ? [...history, opts.extraUserMessage] : history;
  const filtered = items.filter((m) => m.role !== "system" && (m.content || m.attachments?.length));
  const lastUser = [...filtered].reverse().find((m) => m.role === "user");
  const pref = opts.user?.preferences?.aiLanguage || "auto";
  const lang = pref !== "auto" ? pref : (lastUser && detectLanguage(lastUser.content)) || "auto";
  const system = buildSystemPrompt(opts.settings, { userLanguage: lang, userName: opts.user?.name });
  const out: ChatMessage[] = [{ role: "system", content: system }];
  let budget = 0;
  const converted: ChatMessage[] = [];
  for (let i = filtered.length - 1; i >= 0; i--) {
    const msg = await messageToModel(filtered[i], opts.userId, opts.settings);
    const len = typeof msg.content === "string" ? msg.content.length : JSON.stringify(msg.content).length;
    if (budget + len > 400_000 && converted.length) break;
    budget += len;
    converted.unshift(msg);
  }
  return [...out, ...converted];
}
