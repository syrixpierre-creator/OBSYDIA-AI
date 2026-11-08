
function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    if (process.env.NEXT_PHASE === "phase-production-build") return "";
    throw new Error(`Missing required environment variable ${name}`);
  }
  return v;
}

export const env = {
  get appUrl() {
    return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  },
  get appSecret() {
    return req("APP_SECRET");
  },
  get encryptionKey() {
    return req("ENCRYPTION_KEY");
  },
  get cronSecret() {
    return process.env.CRON_SECRET || "";
  },
  get redisUrl() {
    return process.env.REDIS_URL || "";
  },
  get stripeSecretKey() {
    return process.env.STRIPE_SECRET_KEY || "";
  },
  get stripeWebhookSecret() {
    return process.env.STRIPE_WEBHOOK_SECRET || "";
  },
  get smtp() {
    return {
      host: process.env.SMTP_HOST || "",
      port: Number(process.env.SMTP_PORT || 587),
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASSWORD || "",
      from: process.env.SMTP_FROM || "INCONNU SMS <no-reply@localhost>",
      secure: process.env.SMTP_SECURE === "true",
    };
  },
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
  get secureCookies() {
    return (process.env.APP_URL || "").startsWith("https://");
  },
};
