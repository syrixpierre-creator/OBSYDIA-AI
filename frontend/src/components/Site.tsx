import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { LanguageSwitch } from "./LanguageSwitch";
import { useI18n } from "../lib/i18n";
import { useSession } from "../lib/session";

export function SiteNav() {
  const { t } = useI18n();
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  return (
    <header className="site-nav">
      <div className="site-nav-inner">
        <Logo />
        <nav className={`site-links ${open ? "open" : ""}`} onClick={() => setOpen(false)}>
          <a href="/#features">{t("nav.features")}</a>
          <Link to="/pricing">{t("nav.pricing")}</Link>
          <Link to="/docs">{t("nav.docs")}</Link>
          <a href="/#faq">{t("nav.faq")}</a>
        </nav>
        <div className="site-nav-right">
          <span className="hide-sm"><LanguageSwitch /></span>
          {user ? (
            <Link to="/app" className="btn primary sm">{t("nav.openApp")}</Link>
          ) : (
            <>
              <Link to="/login" className="btn ghost sm hide-sm">{t("nav.login")}</Link>
              <Link to="/register" className="btn primary sm">{t("nav.signup")}</Link>
            </>
          )}
          <button className="icon-btn site-menu-btn" onClick={() => setOpen((o) => !o)} aria-label={t("nav.menu")}>
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const { t } = useI18n();
  const { config } = useSession();
  const email = config?.app.email || "inconnuboytech@gmail.com";
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Logo />
            <p style={{ marginTop: 14, maxWidth: 320 }}>{t("brand.tagline")}</p>
            <p style={{ marginTop: 6 }}>{t("landing.footerCreated")}</p>
          </div>
          <div>
            <h5>{t("nav.features")}</h5>
            <a href="/#features">{t("landing.f.chat.t")}</a>
            <a href="/#features">{t("landing.f.project.t")}</a>
            <a href="/#features">{t("landing.f.preview.t")}</a>
          </div>
          <div>
            <h5>Developers</h5>
            <Link to="/docs">{t("nav.docs")}</Link>
            <Link to="/pricing">{t("nav.pricing")}</Link>
            <Link to="/register">{t("nav.signup")}</Link>
          </div>
          <div>
            <h5>Contact</h5>
            <a href={`mailto:${email}`}>{email}</a>
            <span className="row" style={{ marginTop: 8 }}><LanguageSwitch compact /></span>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} OBSYDIA AI. {t("landing.footerRights")}</span>
          <span>{t("landing.footerCreated")}</span>
        </div>
      </div>
    </footer>
  );
}

export function SitePage({ children }: { children: ReactNode }) {
  return (
    <div className="site">
      <SiteNav />
      <main style={{ flex: 1 }}>{children}</main>
      <SiteFooter />
    </div>
  );
}
