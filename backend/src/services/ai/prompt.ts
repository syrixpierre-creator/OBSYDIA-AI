import { env } from "../../config/env.js";
import type { AiSettings } from "../settings.js";

export const CREATOR_ANSWER_EN = (creator: string, app: string) =>
  `I was created by ${creator}, the developer and founder of ${app}.`;
export const CREATOR_ANSWER_FR = (creator: string, app: string) =>
  `J'ai été créé par ${creator}, le développeur et fondateur d'${app}.`;

export function detectLanguage(text: string): "en" | "fr" | null {
  const sample = ` ${text.toLowerCase()} `;
  const fr = [" le ", " la ", " les ", " des ", " est ", " je ", " tu ", " vous ", " pour ", " avec ", " une ", " qui ", " quoi ", " comment ", " créé", " pourquoi ", " c'est ", " bonjour", " merci", "ça "];
  const en = [" the ", " is ", " are ", " you ", " what ", " how ", " with ", " for ", " who ", " this ", " please ", " can ", " i ", " made ", " why ", " hello", " thanks"];
  const f = fr.reduce((n, w) => n + (sample.includes(w) ? 1 : 0), 0);
  const e = en.reduce((n, w) => n + (sample.includes(w) ? 1 : 0), 0);
  if (f === 0 && e === 0) return null;
  return f > e ? "fr" : "en";
}

export function buildSystemPrompt(settings: AiSettings, opts: { userLanguage: "auto" | "en" | "fr"; userName?: string; mode?: "chat" | "project" | "api"; extra?: string }) {
  const e = env();
  const lang =
    opts.userLanguage !== "auto"
      ? opts.userLanguage
      : settings.defaultLanguage !== "auto"
        ? settings.defaultLanguage
        : null;
  const lines = [
    settings.systemPrompt.trim(),
    "",
    `Identity: your name is ${settings.displayName}. You are the assistant of the ${e.APP_NAME} platform, developed by ${e.APP_CREATOR}.`,
    `Personality: ${settings.personality}`,
    `Creator: ${e.APP_CREATOR} is your creator and the founder of ${e.APP_NAME}. Never name any other person, company or AI lab as your creator, developer or owner.`,
    `If asked who created, developed, made, owns or is behind you, answer exactly: "${CREATOR_ANSWER_EN(e.APP_CREATOR, e.APP_NAME)}" In French, answer exactly: "${CREATOR_ANSWER_FR(e.APP_CREATOR, e.APP_NAME)}"`,
    `Contact for business or custom plans: ${e.APP_EMAIL}.`,
    lang
      ? `Language: reply in ${lang === "fr" ? "French" : "English"} unless the user explicitly asks for another language.`
      : "Language: reply in the language of the user's latest message. Do not mix languages within a reply.",
    "Formatting: use GitHub-flavored Markdown. Put code in fenced code blocks with a language tag. Use LaTeX with $...$ or $$...$$ for math.",
    "Be accurate. If you are unsure or lack information, say so instead of inventing facts."
  ];
  if (opts.userName) lines.push(`The user's name is ${opts.userName}.`);
  if (opts.mode === "api") lines.push("You are being accessed through the OBSYDIA developer API.");
  if (opts.extra) lines.push("", opts.extra);
  return lines.join("\n");
}

export function titleFrom(text: string) {
  const clean = text.replace(/[`*_#>\[\]]/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return "New conversation";
  return clean.length > 60 ? `${clean.slice(0, 57).trimEnd()}…` : clean;
}
