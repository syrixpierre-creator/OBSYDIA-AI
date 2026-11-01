import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { useSession } from "../lib/session";
import { useI18n } from "../lib/i18n";

const SENSITIVE = [/^\/login/, /^\/register/, /^\/signup/, /^\/verify-email/, /^\/forgot-password/, /^\/reset-password/, /^\/invite\//, /^\/pricing/, /^\/app\/(admin|settings|developer|billing|pricing)/];
const TYPING_AREAS = [/^\/app\/?$/, /^\/app\/c\//, /^\/app\/projects\/.+/];

export function useAdsConfig() {
  const { config, user } = useSession();
  const ads = config?.ads;
  if (!ads || !ads.enabled) return null;
  if (user && (user.role === "admin" || ads.adFreePlans.includes(user.plan))) return null;
  return ads;
}

function isBlocked(path: string) {
  if (SENSITIVE.some((r) => r.test(path))) return true;
  if (window.matchMedia("(max-width: 768px)").matches && TYPING_AREAS.some((r) => r.test(path))) return true;
  return false;
}

const social = {
  loaded: false,
  nodes: new Set<HTMLElement>(),
  observer: null as MutationObserver | null,
  hidden: false
};

function ownNode(el: Element) {
  return el.id === "root" || el.classList.contains("modal-backdrop") || el.classList.contains("intro") || el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "LINK";
}

function setSocialVisible(visible: boolean) {
  social.hidden = !visible;
  for (const el of social.nodes) {
    if (!el.isConnected) {
      social.nodes.delete(el);
      continue;
    }
    if (visible) el.style.removeProperty("display");
    else el.style.setProperty("display", "none", "important");
  }
}

function injectSocial(src: string) {
  if (social.loaded) return;
  social.loaded = true;
  social.observer = new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) => {
        if (n instanceof HTMLElement && !ownNode(n)) {
          social.nodes.add(n);
          if (social.hidden) n.style.setProperty("display", "none", "important");
        }
      });
    }
  });
  social.observer.observe(document.body, { childList: true });
  social.observer.observe(document.documentElement, { childList: true });
  const s = document.createElement("script");
  s.src = src;
  s.async = true;
  s.setAttribute("data-cfasync", "false");
  s.setAttribute("data-obs-ad", "social");
  document.body.appendChild(s);
}

export function SocialBar() {
  const ads = useAdsConfig();
  const loc = useLocation();
  useEffect(() => {
    const src = ads?.socialSrc;
    if (!src) {
      setSocialVisible(false);
      return;
    }
    if (isBlocked(loc.pathname)) {
      setSocialVisible(false);
      return;
    }
    if (social.loaded) {
      setSocialVisible(true);
      return;
    }
    const introBonus = document.documentElement.classList.contains("intro-lock") ? 3 : 0;
    const delay = Math.max(0, (ads.socialDelaySeconds ?? 20) + introBonus) * 1000;
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      if (!isBlocked(window.location.pathname)) injectSocial(src);
    };
    const timer = window.setTimeout(fire, delay);
    return () => window.clearTimeout(timer);
  }, [ads?.socialSrc, ads?.socialDelaySeconds, loc.pathname]);
  return null;
}

export function NativeBanner({ src, containerId }: { src: string; containerId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver((e) => {
      if (e.some((x) => x.isIntersecting)) {
        setVisible(true);
        io.disconnect();
      }
    }, { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !ref.current) return;
    const host = ref.current;
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.setAttribute("data-cfasync", "false");
    s.setAttribute("data-obs-ad", "native");
    host.appendChild(s);
    return () => {
      s.remove();
      const c = document.getElementById(containerId);
      if (c) c.innerHTML = "";
    };
  }, [visible, src, containerId]);
  return (
    <div ref={ref} className="native-ad">
      <div id={containerId} />
    </div>
  );
}

export function SponsoredBlock() {
  const ads = useAdsConfig();
  const { t } = useI18n();
  const { user } = useSession();
  if (!ads || (!ads.nativeSrc && !ads.smartlink)) return null;
  const upgradeTo = user ? "/app/billing#plans" : "/pricing";
  return (
    <section className="section sponsor-section" aria-label={t("ads.sponsored")}>
      <div className="container">
        <div className="sponsor" data-reveal>
          <div className="sponsor-head">
            <span className="label">{t("ads.sponsored")}</span>
            <Link to={upgradeTo} className="sponsor-remove">
              <Sparkles size={13} /> {t("ads.remove")}
            </Link>
          </div>
          {ads.nativeSrc && ads.nativeContainer && <NativeBanner src={ads.nativeSrc} containerId={ads.nativeContainer} />}
          {ads.smartlink && (
            <a className="sponsor-link" href={ads.smartlink} target="_blank" rel="sponsored noopener noreferrer nofollow">
              <div>
                <div className="sponsor-link-title">{t("ads.partner")} <span className="badge">Ad</span></div>
                <div className="sponsor-link-desc">{t("ads.partnerDesc")}</div>
              </div>
              <span className="btn sm">{t("ads.open")} <ArrowUpRight size={14} /></span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
