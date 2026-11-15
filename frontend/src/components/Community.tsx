import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { X } from "lucide-react";
import { useSession } from "../lib/session";
import { useI18n } from "../lib/i18n";

const KEY = "obs_community_prompt";
const SNOOZE_MS = 3 * 86400_000;
const BLOCKED = [/^\/login/, /^\/register/, /^\/signup/, /^\/verify-email/, /^\/forgot-password/, /^\/reset-password/, /^\/invite\//, /^\/app\/(admin|billing|pricing)/];
const TYPING = [/^\/app\/?$/, /^\/app\/c\//, /^\/app\/projects\/.+/];

function readState(): { done?: boolean; until?: number } {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function writeState(v: { done?: boolean; until?: number }) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {}
}

function eligible() {
  const s = readState();
  return !s.done && (!s.until || s.until < Date.now());
}

function blocked(path: string) {
  if (BLOCKED.some((r) => r.test(path))) return true;
  return window.matchMedia("(max-width: 768px)").matches && TYPING.some((r) => r.test(path));
}

export function WhatsAppIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.23 8.23 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24a8.24 8.24 0 0 1 8.24 8.25c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.29Z" />
    </svg>
  );
}

export function CommunityPrompt() {
  const { config } = useSession();
  const { t } = useI18n();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const c = config?.community;

  useEffect(() => {
    if (!c?.prompt || !c.whatsappUrl || open || !eligible()) return;
    if (blocked(loc.pathname)) return;
    const introBonus = document.documentElement.classList.contains("intro-lock") ? 3 : 0;
    const h = window.setTimeout(() => {
      if (eligible() && !blocked(window.location.pathname)) setOpen(true);
    }, (Math.max(0, c.delaySeconds) + introBonus) * 1000);
    return () => window.clearTimeout(h);
  }, [c?.prompt, c?.whatsappUrl, c?.delaySeconds, loc.pathname, open]);

  useEffect(() => {
    if (open && blocked(loc.pathname)) setOpen(false);
  }, [loc.pathname, open]);

  if (!open || !c?.whatsappUrl) return null;

  const close = (state: { done?: boolean; until?: number }) => {
    writeState(state);
    setLeaving(true);
    window.setTimeout(() => {
      setOpen(false);
      setLeaving(false);
    }, 280);
  };

  return (
    <div className={`community ${leaving ? "community-leave" : ""}`} role="dialog" aria-label={t("community.title")}>
      <button className="icon-btn community-x" onClick={() => close({ done: true })} aria-label={t("common.close")}>
        <X size={15} />
      </button>
      <div className="community-head">
        <div className="community-avatar">
          <img src="/obsydia-avatar.png" alt="" />
          <span className="community-wa"><WhatsAppIcon size={12} /></span>
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="community-title">{t("community.title")}</div>
          <div className="community-sub">WhatsApp · OBSYDIA AI</div>
        </div>
      </div>
      <p className="community-body">{t("community.body")}</p>
      <div className="community-actions">
        <a className="btn primary community-follow" href={c.whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={() => close({ done: true })}>
          <WhatsAppIcon size={16} /> {t("community.follow")}
        </a>
        <button className="btn ghost" onClick={() => close({ until: Date.now() + SNOOZE_MS })}>{t("community.later")}</button>
      </div>
    </div>
  );
}
