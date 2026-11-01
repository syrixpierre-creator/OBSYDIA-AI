import { describe, expect, it } from "vitest";
import { buildSystemPrompt, detectLanguage, titleFrom } from "../src/services/ai/prompt.js";
import { envAiSettings } from "../src/services/settings.js";

describe("AI identity and prompt", () => {
  const prompt = buildSystemPrompt(envAiSettings(), { userLanguage: "auto" });

  it("includes the exact creator answers", () => {
    expect(prompt).toContain("I was created by Inconnu Boy Sensei, the developer and founder of OBSYDIA AI.");
    expect(prompt).toContain("J'ai été créé par Inconnu Boy Sensei, le développeur et fondateur d'OBSYDIA AI.");
    expect(prompt).toMatch(/Never name any other person/);
  });

  it("uses the configured display name and system prompt", () => {
    const s = { ...envAiSettings(), displayName: "NOVA", systemPrompt: "Custom base prompt" };
    const p = buildSystemPrompt(s, { userLanguage: "fr" });
    expect(p.startsWith("Custom base prompt")).toBe(true);
    expect(p).toContain("your name is NOVA");
    expect(p).toContain("reply in French");
  });

  it("detects user language", () => {
    expect(detectLanguage("Bonjour, qui t'a créé et comment ça marche ?")).toBe("fr");
    expect(detectLanguage("Hello, who made you and how does this work?")).toBe("en");
  });

  it("derives short titles", () => {
    expect(titleFrom("## Build me a **landing page**")).toBe("Build me a landing page");
    expect(titleFrom("x".repeat(100)).length).toBeLessThanOrEqual(60);
  });
});
