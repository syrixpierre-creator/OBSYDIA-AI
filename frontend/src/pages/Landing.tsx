import { Link } from "react-router-dom";
import { MessagesSquare, Code2, Boxes, FileArchive, MonitorPlay, Mic, Webhook, Users, ArrowRight, Mail } from "lucide-react";
import { SitePage } from "../components/Site";
import { PlanGrid } from "./Pricing";
import { useI18n, type TKey } from "../lib/i18n";
import { useSession } from "../lib/session";
import { formatNumber } from "../lib/api";

const FEATURES: { icon: any; k: string }[] = [
  { icon: MessagesSquare, k: "chat" },
  { icon: Code2, k: "code" },
  { icon: Boxes, k: "project" },
  { icon: FileArchive, k: "zip" },
  { icon: MonitorPlay, k: "preview" },
  { icon: Mic, k: "input" },
  { icon: Webhook, k: "api" },
  { icon: Users, k: "team" }
];

export function Landing() {
  const { t, locale } = useI18n();
  const { config, user } = useSession();
  const host = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <SitePage>
      <section className="hero">
        <div className="hero-lines" />
        <div className="container hero-grid">
          <div>
            <span className="eyebrow">{t("landing.eyebrow")}</span>
            <h1>{t("landing.hero")}</h1>
            <p className="lead">{t("landing.sub")}</p>
            <div className="hero-cta">
              <Link to={user ? "/app" : "/register"} className="btn primary lg">
                {t("landing.ctaStart")} <ArrowRight size={16} />
              </Link>
              <a href="#features" className="btn lg">{t("landing.ctaFeatures")}</a>
              <Link to="/pricing" className="btn ghost lg">{t("landing.ctaPricing")}</Link>
            </div>
          </div>
          <div className="hero-art">
            <img src="/obsydia-hero.jpg" alt="OBSYDIA AI" />
            <span className="hero-tag">THINK · CREATE · BUILD · DEPLOY</span>
          </div>
        </div>
      </section>
      <div className="stats-band container" style={{ padding: 0 }}>
        <div><b>01</b>{t("landing.stat1")}</div>
        <div><b>02</b>{t("landing.stat2")}</div>
        <div><b>03</b>{t("landing.stat3")}</div>
        <div><b>04</b>{t("landing.stat4")}</div>
      </div>

      <section className="section">
        <div className="container split">
          <div>
            <span className="eyebrow">OBSYDIA AI</span>
            <h2 style={{ fontSize: "clamp(28px,3.6vw,42px)", letterSpacing: "-0.03em", lineHeight: 1.1, margin: "12px 0 16px" }}>{t("landing.introTitle")}</h2>
            <p className="muted" style={{ fontSize: 16.5, margin: 0 }}>{t("landing.introBody")}</p>
          </div>
          <div className="terminal" aria-hidden>
            <div className="terminal-head"><i /><i /><i /><span>obsydia · project builder</span></div>
            <pre>
<span className="c"># {locale === "fr" ? "demande" : "request"}</span>{"\n"}
<span className="s">"Build a SaaS landing page with pricing and auth"</span>{"\n\n"}
<span className="k">plan</span>      index.html · styles.css · app.js · README.md{"\n"}
<span className="k">generate</span>  4/4 files written{"\n"}
<span className="k">validate</span>  syntax ✓  assets ✓  placeholders ✓{"\n"}
<span className="k">package</span>   saas-landing-v1.zip  (18.4 KB){"\n"}
<span className="k">preview</span>   desktop · tablet · mobile
            </pre>
          </div>
        </div>
      </section>

      <section className="section" id="features">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow">{t("landing.featuresTitle")}</span>
              <h2>{t("landing.hero")}</h2>
            </div>
            <p>{t("landing.sub")}</p>
          </div>
          <div className="features">
            {FEATURES.map((f) => (
              <div className="feature" key={f.k}>
                <div className="ico"><f.icon size={18} /></div>
                <h3>{t(`landing.f.${f.k}.t` as TKey)}</h3>
                <p>{t(`landing.f.${f.k}.d` as TKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow">{t("landing.f.project.t")}</span>
              <h2>{t("landing.howTitle")}</h2>
            </div>
            <p>{t("landing.f.project.d")}</p>
          </div>
          <div className="steps">
            {[1, 2, 3, 4].map((n) => (
              <div className="step" key={n}>
                <span className="n">0{n}</span>
                <h4>{t(`landing.how${n}.t` as TKey)}</h4>
                <p>{t(`landing.how${n}.d` as TKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container split">
          <div>
            <span className="eyebrow">{t("landing.f.api.t")}</span>
            <h2 style={{ fontSize: "clamp(28px,3.6vw,42px)", letterSpacing: "-0.03em", lineHeight: 1.1, margin: "12px 0 16px" }}>{t("landing.apiTitle")}</h2>
            <p className="muted" style={{ fontSize: 16.5, margin: "0 0 24px" }}>{t("landing.apiBody")}</p>
            <Link to="/docs" className="btn">{t("landing.apiCta")} <ArrowRight size={15} /></Link>
          </div>
          <div className="terminal">
            <div className="terminal-head"><i /><i /><i /><span>curl</span></div>
            <pre>
{`curl ${host}/api/v1/chat \\
  -H "Authorization: Bearer $OBSYDIA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [
      {"role": "user", "content": "Hello OBSYDIA"}
    ],
    "stream": false
  }'`}
            </pre>
          </div>
        </div>
      </section>

      <section className="section" id="pricing">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow">{t("nav.pricing")}</span>
              <h2>{t("pricing.title")}</h2>
            </div>
            <p>{t("pricing.sub")}</p>
          </div>
          <PlanGrid />
        </div>
      </section>

      <section className="section">
        <div className="container split">
          <div>
            <span className="eyebrow">{t("nav.referrals")}</span>
            <h2 style={{ fontSize: "clamp(28px,3.6vw,42px)", letterSpacing: "-0.03em", lineHeight: 1.1, margin: "12px 0 16px" }}>{t("landing.referralTitle")}</h2>
            <p className="muted" style={{ fontSize: 16.5, margin: 0 }}>
              {t("landing.referralBody", { n: config?.referral.required ?? 5, tokens: formatNumber(config?.referral.rewardTokens ?? 10000, locale) })}
            </p>
          </div>
          <div className="card card-pad" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
            {Array.from({ length: config?.referral.required ?? 5 }).map((_, i) => (
              <div key={i} style={{ aspectRatio: "1", borderRadius: 12, border: "1px solid var(--border-strong)", display: "grid", placeItems: "center", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                {i + 1}
              </div>
            ))}
            <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <span className="muted">= +{formatNumber(config?.referral.rewardTokens ?? 10000, locale)} {t("common.tokens")}</span>
              <Link to="/register" className="btn sm primary">{t("nav.signup")}</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="faq">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow">{t("nav.faq")}</span>
              <h2>{t("landing.faqTitle")}</h2>
            </div>
          </div>
          <div className="faq">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <details key={n}>
                <summary>{t(`landing.faq${n}.q` as TKey)}</summary>
                <p>{t(`landing.faq${n}.a` as TKey)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="contact" style={{ borderBottom: 0 }}>
        <div className="container split">
          <div>
            <span className="eyebrow">Contact</span>
            <h2 style={{ fontSize: "clamp(28px,3.6vw,42px)", letterSpacing: "-0.03em", lineHeight: 1.1, margin: "12px 0 16px" }}>{t("landing.contactTitle")}</h2>
            <p className="muted" style={{ fontSize: 16.5, margin: 0 }}>{t("landing.contactBody")}</p>
          </div>
          <div className="card card-pad stack">
            <span className="label">E-mail</span>
            <a href={`mailto:${config?.app.email}`} style={{ fontSize: 20, fontWeight: 600 }}>{config?.app.email}</a>
            <div className="divider" />
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <span className="muted">{config?.app.creator} · {config?.app.company}</span>
              <a className="btn sm" href={`mailto:${config?.app.email}`}><Mail size={14} /> {t("pricing.contact")}</a>
            </div>
          </div>
        </div>
      </section>
    </SitePage>
  );
}
