import type { Request } from "express";
import { sha256 } from "./crypto.js";
import { env } from "../config/env.js";

export function clientIp(req: Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function ipHash(req: Request) {
  return sha256(`${env().SESSION_SECRET}:${clientIp(req)}`).slice(0, 32);
}

export function requestLocale(req: Request): "en" | "fr" {
  const header = String(req.headers["accept-language"] || "").toLowerCase();
  return header.startsWith("fr") ? "fr" : "en";
}
