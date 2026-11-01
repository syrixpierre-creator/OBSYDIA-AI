import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "test" ? "silent" : "info"),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "apiKey",
      "key",
      "password",
      "*.apiKey",
      "*.password",
      "*.secret"
    ],
    censor: "[redacted]"
  },
  base: { service: "obsydia-ai" }
});

export function scrub(text: string) {
  return text
    .replace(/(sk|obs|xk)[-_][A-Za-z0-9_-]{8,}/g, "[redacted-key]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
}
