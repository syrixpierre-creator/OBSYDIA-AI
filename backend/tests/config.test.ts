import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";

const base = {
  MONGODB_URI: "mongodb://localhost/x",
  JWT_SECRET: "a".repeat(40),
  SESSION_SECRET: "b".repeat(40),
  ENCRYPTION_KEY: "c".repeat(40)
};

describe("configuration validation", () => {
  it("applies the documented defaults", () => {
    const e = loadEnv({ ...base });
    expect(e.APP_NAME).toBe("OBSYDIA AI");
    expect(e.APP_CREATOR).toBe("Inconnu Boy Sensei");
    expect(e.XKIRO_BASE_URL).toBe("https://api.xkiro.com/v1");
    expect(e.XKIRO_MODEL).toBe("qwen/qwen3.8-omni-flash:free");
    expect(e.FREE_TOKEN_LIMIT).toBe(25000);
    expect(e.FREE_TOKEN_RESET_HOURS).toBe(168);
    expect(e.PRO_TOKEN_LIMIT).toBe(60000);
    expect(e.PREMIUM_TOKEN_LIMIT).toBe(300000);
    expect(e.REFERRAL_REQUIRED).toBe(5);
    expect(e.MAX_TEAM_INVITES).toBe(3);
  });

  it("accepts an unlimited JSON array of provider keys", () => {
    const keys = Array.from({ length: 57 }, (_, i) => `KEY_${i}`);
    const e = loadEnv({ ...base, XKIRO_API_KEYS: JSON.stringify(keys) });
    expect(e.XKIRO_API_KEYS).toHaveLength(57);
  });

  it("accepts comma separated keys and empty arrays", () => {
    expect(loadEnv({ ...base, XKIRO_API_KEYS: "A, B ,C" }).XKIRO_API_KEYS).toEqual(["A", "B", "C"]);
    expect(loadEnv({ ...base, XKIRO_API_KEYS: "[]" }).XKIRO_API_KEYS).toEqual([]);
  });

  it("rejects malformed JSON key arrays", () => {
    expect(() => loadEnv({ ...base, XKIRO_API_KEYS: '["A",' })).toThrow(/XKIRO_API_KEYS/);
  });

  it("supports multiline system prompts", () => {
    const e = loadEnv({ ...base, AI_SYSTEM_PROMPT: "Line one\\nLine two" });
    expect(e.AI_SYSTEM_PROMPT).toBe("Line one\nLine two");
  });

  it("requires secrets and rejects weak production secrets", () => {
    expect(() => loadEnv({ MONGODB_URI: "x" })).toThrow(/JWT_SECRET/);
    expect(() => loadEnv({ ...base, NODE_ENV: "production", JWT_SECRET: "change-me-change-me-change-me-change-me" })).toThrow(/random values/);
  });
});
