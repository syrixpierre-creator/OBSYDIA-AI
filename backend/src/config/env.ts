import { z } from "zod";

const jsonArray = z.string().transform((value, ctx) => {
  const trimmed = value.trim();
  if (!trimmed) return [] as string[];
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || parsed.some((k) => typeof k !== "string")) throw new Error("not an array of strings");
    return parsed.map((k: string) => k.trim()).filter(Boolean);
  } catch {
    if (trimmed.startsWith("[")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "must be a JSON array of strings" });
      return z.NEVER;
    }
    return trimmed.split(",").map((k) => k.trim()).filter(Boolean);
  }
});

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1" || v === "yes");

const int = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === "") return fallback;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "must be a positive number" });
        return z.NEVER;
      }
      return n;
    });

const multiline = (fallback: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.replace(/\\n/g, "\n") : fallback));

const DEFAULT_SYSTEM_PROMPT =
  "You are OBSYDIA AI, an advanced AI assistant created by Inconnu Boy Sensei. You help with programming, development, research, explanations and project generation. Be professional, accurate and helpful. When asked who created you, identify Inconnu Boy Sensei as your creator.";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: int(8080),
  APP_NAME: z.string().default("OBSYDIA AI"),
  APP_CREATOR: z.string().default("Inconnu Boy Sensei"),
  APP_COMPANY: z.string().default("SYRIX VISION COMPANY"),
  APP_EMAIL: z.string().email().default("inconnuboytech@gmail.com"),
  APP_URL: z.string().url().default("http://localhost:8080"),
  CORS_ORIGINS: z.string().optional().default(""),
  TRUST_PROXY: int(1),
  DATA_DIR: z.string().default("./data"),

  AI_DISPLAY_NAME: z.string().default("OBSYDIA"),
  AI_PERSONALITY: z.string().default("Professional, intelligent, friendly, precise and technically advanced."),
  AI_SYSTEM_PROMPT: multiline(DEFAULT_SYSTEM_PROMPT),
  AI_WELCOME_MESSAGE: z.string().default("Welcome to OBSYDIA AI. What would you like to create today?"),
  AI_DEFAULT_LANGUAGE: z.enum(["auto", "en", "fr"]).default("auto"),
  AI_MAX_OUTPUT_TOKENS: int(4096),
  AI_PROJECT_MAX_OUTPUT_TOKENS: int(16000),
  AI_CONTEXT_MESSAGES: int(24),

  AI_PROVIDER: z.string().default("xkiro"),
  XKIRO_BASE_URL: z.string().url().default("https://api.xkiro.com/v1"),
  XKIRO_MODEL: z.string().default("qwen/qwen3.8-omni-flash:free"),
  XKIRO_MODELS: z.string().optional().default(""),
  XKIRO_API_KEYS: jsonArray.default("[]"),
  XKIRO_TIMEOUT_MS: int(120000),
  XKIRO_MAX_RETRIES: int(3),
  XKIRO_SUPPORTS_VISION: bool,
  XKIRO_SUPPORTS_AUDIO: bool,
  XKIRO_SUPPORTS_TOOLS: bool,

  TRANSCRIPTION_BASE_URL: z.string().optional().default(""),
  TRANSCRIPTION_API_KEY: z.string().optional().default(""),
  TRANSCRIPTION_MODEL: z.string().optional().default("whisper-1"),

  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  REDIS_URL: z.string().optional().default(""),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  ENCRYPTION_KEY: z.string().min(32, "ENCRYPTION_KEY must be at least 32 characters"),
  SESSION_TTL_DAYS: int(30),

  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: int(587),
  SMTP_SECURE: bool,
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASSWORD: z.string().optional().default(""),
  SMTP_FROM: z.string().default("inconnuboytech@gmail.com"),

  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),

  STRIPE_SECRET_KEY: z.string().optional().default(""),
  STRIPE_PUBLISHABLE_KEY: z.string().optional().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),

  PAYPAL_CLIENT_ID: z.string().optional().default(""),
  PAYPAL_CLIENT_SECRET: z.string().optional().default(""),
  PAYPAL_WEBHOOK_ID: z.string().optional().default(""),
  PAYPAL_MODE: z.enum(["sandbox", "live"]).default("sandbox"),
  PAYPAL_PLAN_ID_PRO: z.string().optional().default(""),
  PAYPAL_PLAN_ID_PREMIUM: z.string().optional().default(""),

  DOMAIN: z.string().optional().default(""),
  ACME_EMAIL: z.string().optional().default("inconnuboytech@gmail.com"),

  FREE_TOKEN_LIMIT: int(25000),
  FREE_TOKEN_RESET_HOURS: int(168),
  PRO_TOKEN_LIMIT: int(60000),
  PRO_TOKEN_RESET_HOURS: int(7),
  PREMIUM_TOKEN_LIMIT: int(300000),
  PREMIUM_TOKEN_RESET_HOURS: int(7),
  PRO_PRICE_USD: z.string().optional().default("1.99"),
  PREMIUM_PRICE_USD: z.string().optional().default("5.00"),

  REFERRAL_REQUIRED: int(5),
  REFERRAL_REWARD_TOKENS: int(10000),
  MAX_TEAM_INVITES: int(3),

  MAX_UPLOAD_MB: int(25),
  MAX_ZIP_ENTRIES: int(2000),
  MAX_ZIP_UNCOMPRESSED_MB: int(200),
  ARTIFACT_LINK_TTL_MINUTES: int(15),
  PREVIEW_LINK_TTL_MINUTES: int(60),

  ADMIN_EMAIL: z.string().optional().default(""),
  ADMIN_PASSWORD: z.string().optional().default("")
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join("\n")}`);
  }
  const env = result.data;
  if (env.NODE_ENV === "production") {
    const weak = ["JWT_SECRET", "SESSION_SECRET", "ENCRYPTION_KEY"].filter((k) =>
      /change|example|secret|your/i.test(String(env[k as keyof Env]))
    );
    if (weak.length) throw new Error(`Invalid configuration:\n  - ${weak.join(", ")} must be replaced with random values`);
  }
  return env;
}

export function env(): Env {
  if (!cached) cached = loadEnv();
  return cached;
}

export function resetEnvCache() {
  cached = null;
}

export function isProd() {
  return env().NODE_ENV === "production";
}

export function corsOrigins(): string[] {
  const e = env();
  const list = e.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
  return Array.from(new Set([new URL(e.APP_URL).origin, ...list]));
}
