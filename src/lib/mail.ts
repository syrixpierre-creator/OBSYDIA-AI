import nodemailer from "nodemailer";
import { env } from "./env";
import { syslog } from "./audit";

let transporter: nodemailer.Transporter | null = null;

export function mailConfigured() {
  return Boolean(env.smtp.host);
}

function getTransporter() {
  if (!transporter) {
    const s = env.smtp;
    transporter = nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: s.secure,
      auth: s.user ? { user: s.user, pass: s.pass } : undefined,
    });
  }
  return transporter;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(title: string, body: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#08090D;font-family:Inter,Arial,sans-serif;color:#ECEDF3">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px"><tr><td align="center">
  <table width="520" cellpadding="0" cellspacing="0" style="background:#0E1016;border:1px solid #1f2230;border-radius:16px;padding:32px">
  <tr><td style="font-weight:800;font-size:18px;letter-spacing:.08em">INCONNU <span style="color:#8B5CF6">SMS</span></td></tr>
  <tr><td style="padding-top:24px;font-size:20px;font-weight:700">${escapeHtml(title)}</td></tr>
  <tr><td style="padding-top:12px;font-size:14px;line-height:1.6;color:#A1A6B8">${body}</td></tr>
  ${cta ? `<tr><td style="padding-top:24px"><a href="${cta.url}" style="display:inline-block;background:linear-gradient(135deg,#8B5CF6,#3B82F6);color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:14px">${escapeHtml(cta.label)}</a></td></tr>
  <tr><td style="padding-top:16px;font-size:12px;color:#6B7083;word-break:break-all">${cta.url}</td></tr>` : ""}
  <tr><td style="padding-top:32px;font-size:11px;color:#4B5063">Your Numbers. Your World. — BY INCONNU BOY SENSEI</td></tr>
  </table></td></tr></table></body></html>`;
}

export async function sendMail(to: string, subject: string, title: string, bodyHtml: string, cta?: { label: string; url: string }, sensitive = false) {
  if (!mailConfigured()) {
    // No SMTP configured: log the message so the operator can still complete flows on a fresh install.
    await syslog("warn", "mail", `SMTP not configured — email to ${to} not sent: ${subject}`, { link: sensitive ? "[redacted]" : (cta?.url ?? null) });
    return false;
  }
  try {
    await getTransporter().sendMail({ from: env.smtp.from, to, subject, html: layout(title, bodyHtml, cta) });
    return true;
  } catch (e) {
    await syslog("error", "mail", `Failed to send email to ${to}`, { error: String(e) });
    return false;
  }
}

export { escapeHtml };
