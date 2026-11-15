import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { MulterError } from "multer";
import { corsOrigins, env } from "./config/env.js";
import { AppError } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { mongoSanitize } from "./lib/sanitize.js";
import { csrfProtection, loadUser } from "./middleware/auth.js";
import { dbReady } from "./lib/db.js";
import { authRouter } from "./routes/auth.js";
import { chatRouter } from "./routes/chat.js";
import { filesRouter } from "./routes/files.js";
import { projectsRouter } from "./routes/projects.js";
import { previewRouter } from "./routes/preview.js";
import { billingRouter, tokensRouter } from "./routes/billing.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { developerRouter } from "./routes/developer.js";
import { apiV1Router } from "./routes/apiV1.js";
import { referralsRouter, teamsRouter } from "./routes/growth.js";
import { adminRouter } from "./routes/admin.js";
import { publicRouter } from "./routes/public.js";
import { adsActiveSync, getAds } from "./services/ads.js";

const startedAt = Date.now();

function cors(req: Request, res: Response, next: NextFunction) {
  const origin = req.get("origin");
  if (req.path.startsWith("/api/v1")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Max-Age", "600");
  } else if (origin && corsOrigins().includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let status = 500;
  let code = "internal_error";
  let message = "An unexpected error occurred";
  let details: unknown;
  if (err instanceof AppError) {
    status = err.status;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof MulterError) {
    status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    code = err.code === "LIMIT_FILE_SIZE" ? "file_too_large" : "upload_error";
    message = err.code === "LIMIT_FILE_SIZE" ? `Files are limited to ${env().MAX_UPLOAD_MB} MB` : err.message;
  } else if ((err as any)?.type === "entity.parse.failed") {
    status = 400;
    code = "invalid_json";
    message = "Request body is not valid JSON";
  } else if ((err as any)?.type === "entity.too.large") {
    status = 413;
    code = "payload_too_large";
    message = "Request body is too large";
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    code = "invalid_id";
    message = "Invalid identifier";
  } else if ((err as any)?.code === 11000) {
    status = 409;
    code = "duplicate";
    message = "This resource already exists";
  }
  if (status >= 500) logger.error({ err, path: req.path }, "request failed");
  res.locals.errorCode = code;
  if (res.headersSent) {
    res.end();
    return;
  }
  if (status === 499) {
    res.status(499).end();
    return;
  }
  res.status(status).json({ error: { code, message, ...(details !== undefined ? { details } : {}) } });
}

export function createApp() {
  const e = env();
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", e.TRUST_PROXY);

  app.get("/health", (_req, res) => {
    const ok = dbReady();
    res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded", database: ok ? "connected" : "disconnected", uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) });
  });

  const previewOrigin = process.env.PREVIEW_URL ? new URL(process.env.PREVIEW_URL).origin : null;
  const adsSrc = (strict: string) => () => (adsActiveSync() ? "https: 'unsafe-inline'" : strict);
  void getAds().catch(() => undefined);
  const adsRefresh = setInterval(() => void getAds(true).catch(() => undefined), 30_000);
  adsRefresh.unref();
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", adsSrc("")],
          styleSrc: ["'self'", "'unsafe-inline'", () => (adsActiveSync() ? "https:" : "")],
          imgSrc: ["'self'", "data:", "blob:", () => (adsActiveSync() ? "https:" : "")],
          fontSrc: ["'self'", "data:", () => (adsActiveSync() ? "https:" : "")],
          connectSrc: ["'self'", () => (adsActiveSync() ? "https: wss:" : "")],
          mediaSrc: ["'self'", "blob:"],
          frameSrc: ["'self'", ...(previewOrigin ? [previewOrigin] : []), () => (adsActiveSync() ? "https:" : "")],
          workerSrc: ["'self'", "blob:"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'self'"],
          ...(e.NODE_ENV === "production" && e.APP_URL.startsWith("https") ? { upgradeInsecureRequests: [] } : {})
        }
      },
      crossOriginEmbedderPolicy: false,
      hsts: e.NODE_ENV === "production" && e.APP_URL.startsWith("https") ? { maxAge: 15552000, includeSubDomains: false } : false
    })
  );
  app.use(compression({ filter: (req, res) => !String(res.getHeader("Content-Type") || "").includes("text/event-stream") && compression.filter(req, res) }));
  app.use(cors);
  app.use("/api/webhooks", webhooksRouter);
  app.use("/api/v1", apiV1Router);
  app.use("/preview", previewRouter);
  app.use(cookieParser());
  const jsonSmall = express.json({ limit: "2mb" });
  const jsonLarge = express.json({ limit: "12mb" });
  app.use((req, res, next) => (req.path.startsWith("/api/admin") ? jsonLarge : jsonSmall)(req, res, next));
  app.use(mongoSanitize);
  app.use("/api", loadUser, csrfProtection);
  app.use("/api/public", publicRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/chat", chatRouter);
  app.use("/api/files", filesRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/billing", billingRouter);
  app.use("/api/tokens", tokensRouter);
  app.use("/api/developer", developerRouter);
  app.use("/api/referrals", referralsRouter);
  app.use("/api/teams", teamsRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api", (_req, _res, next) => next(new AppError(404, "not_found", "Endpoint not found")));

  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [process.env.STATIC_DIR, path.resolve(here, "../public"), path.resolve(here, "../../frontend/dist")].filter(Boolean) as string[];
  const staticDir = candidates.find((d) => fs.existsSync(path.join(d, "index.html")));
  if (staticDir) {
    app.use(
      express.static(staticDir, {
        index: false,
        maxAge: "1y",
        immutable: true,
        setHeaders: (res, p) => {
          if (!p.includes(`${path.sep}assets${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=300");
        }
      })
    );
    const indexHtml = fs.readFileSync(path.join(staticDir, "index.html"), "utf8");
    app.get(/^(?!\/api|\/preview|\/health).*/, (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.type("html").send(indexHtml);
    });
  }

  app.use(errorHandler);
  return app;
}
