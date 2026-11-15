import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "./logger.js";
import { renderEmail, type EmailKind } from "./emailTemplates.js";

let transporter: Transporter | null = null;
export const devOutbox: { to: string; subject: string; text: string; html: string }[] = [];

export function mailConfigured() {
  const e = env();
  return Boolean(e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASSWORD);
}

function getTransport() {
  if (transporter) return transporter;
  const e = env();
  transporter = nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_SECURE || e.SMTP_PORT === 465,
    auth: { user: e.SMTP_USER, pass: e.SMTP_PASSWORD }
  });
  return transporter;
}

export async function sendEmail(to: string, kind: EmailKind, locale: "en" | "fr", data: Record<string, string>) {
  const e = env();
  const message = renderEmail(kind, locale, data);
  if (!mailConfigured()) {
    if (e.NODE_ENV === "production") {
      logger.error({ kind }, "SMTP is not configured; email not sent");
      return false;
    }
    devOutbox.push({ to, ...message });
    if (devOutbox.length > 200) devOutbox.shift();
    logger.info({ to, subject: message.subject, text: message.text }, "development email (SMTP not configured)");
    return true;
  }
  try {
    await getTransport().sendMail({
      from: `"${e.APP_NAME}" <${e.SMTP_FROM}>`,
      to,
      subject: message.subject,
      text: message.text,
      html: message.html
    });
    return true;
  } catch (err) {
    logger.error({ kind, err: (err as Error).message }, "email delivery failed");
    return false;
  }
}
