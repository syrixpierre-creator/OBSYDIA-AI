import { describe, expect, it } from "vitest";
import { loadEnv, resetEnvCache } from "../src/config/env.js";
import { providerConfig } from "../src/config/provider.js";

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
    expect(e.AI_PROVIDER).toBe("deepseek");
    expect(e.FREE_TOKEN_LIMIT).toBe(25000);
    expect(e.FREE_TOKEN_RESET_HOURS).toBe(168);
    expect(e.PRO_TOKEN_LIMIT).toBe(60000);
    expect(e.PREMIUM_TOKEN_LIMIT).toBe(300000);
    expect(e.REFERRAL_REQUIRED).toBe(5);
    expect(e.MAX_TEAM_INVITES).toBe(3);
  });

  it("accepts an unlimited JSON array of provider keys", () => {
    const keys = Array.from({ length: 57 }, (_, i) => `KEY_${i}`);
    const e = loadEnv({ ...base, AI_API_KEYS: JSON.stringify(keys) });
    expect(e.AI_API_KEYS).toHaveLength(57);
  });

  it("accepts comma separated keys and empty arrays", () => {
    expect(loadEnv({ ...base, AI_API_KEYS: "A, B ,C" }).AI_API_KEYS).toEqual(["A", "B", "C"]);
    expect(loadEnv({ ...base, AI_API_KEYS: "[]" }).AI_API_KEYS).toEqual([]);
  });

  it("rejects malformed JSON key arrays", () => {
    expect(() => loadEnv({ ...base, AI_API_KEYS: '["A",' })).toThrow(/AI_API_KEYS/);
    expect(() => loadEnv({ ...base, AI_EXTRA_BODY: "[1]" })).toThrow(/AI_EXTRA_BODY/);
  });

  it("supports multiline system prompts", () => {
    const e = loadEnv({ ...base, AI_SYSTEM_PROMPT: "Line one\\nLine two" });
    expect(e.AI_SYSTEM_PROMPT).toBe("Line one\nLine two");
  });

  it("requires secrets and rejects weak production secrets", () => {
    expect(() => loadEnv({ MONGODB_URI: "x" })).toThrow(/JWT_SECRET/);
    expect(() => loadEnv({ ...base, NODE_ENV: "production", JWT_SECRET: "change-me-change-me-change-me-change-me" })).toThrow(/random values/);
  });

  it("resolves DeepSeek defaults and keeps XKIRO configs working", () => {
    const saved = { ...process.env };
    const apply = (vars: Record<string, string>) => {
      for (const k of Object.keys(process.env)) if (k.startsWith("AI_") || k.startsWith("XKIRO_")) delete process.env[k];
      Object.assign(process.env, base, vars);
      resetEnvCache();
      return providerConfig();
    };
    const ds = apply({ AI_API_KEYS: '["sk-1"]', XKIRO_API_KEYS: '["old"]' });
    expect(ds.name).toBe("deepseek");
    expect(ds.baseURL).toBe("https://api.deepseek.com");
    expect(ds.model).toBe("deepseek-v4-flash");
    expect(ds.keys).toEqual(["sk-1"]);
    expect(ds.extraBody).toEqual({ thinking: { type: "disabled" } });
    const custom = apply({ AI_MODEL: "deepseek-v4-pro", AI_EXTRA_BODY: "{}", AI_SUPPORTS_VISION: "true" });
    expect(custom.model).toBe("deepseek-v4-pro");
    expect(custom.extraBody).toEqual({});
    expect(custom.capabilities.vision).toBe(true);
    const legacy = apply({ AI_PROVIDER: "xkiro", XKIRO_API_KEYS: '["xk"]', XKIRO_MODEL: "qwen/x" });
    expect(legacy.baseURL).toBe("https://api.xkiro.com/v1");
    expect(legacy.model).toBe("qwen/x");
    expect(legacy.keys).toEqual(["xk"]);
    process.env = saved;
    resetEnvCache();
  });
});
