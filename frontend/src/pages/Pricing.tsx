import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import { SitePage } from "../components/Site";
import { Modal } from "../components/Modal";
import { api, formatNumber, money } from "../lib/api";
import { useI18n, type TKey } from "../lib/i18n";
import { useSession, type PlanInfo } from "../lib/session";

function features(p: PlanInfo, t: (k: TKey, v?: any) => string): string[] {
  if (p.id === "free") return [t("pricing.feat.standard"), t("pricing.feat.history"), t("pricing.feat.images"), t("pricing.feat.basicProjects"), t("pricing.feat.zipDownloads"), t("pricing.feat.preview"), t("pricing.feat.copy"), t("pricing.feat.basicUploads")];
  if (p.id === "pro") return [t("pricing.feat.priority"), t("pricing.feat.api"), t("pricing.feat.advancedProjects"), t("pricing.feat.zipDownloads"), t("pricing.feat.preview"), t("pricing.feat.images"), t("pricing.feat.zipUploads"), t("pricing.feat.voice"), t("pricing.feat.pinned")];
  if (p.id === "premium") return [t("pricing.feat.priority"), t("pricing.feat.api"), t("pricing.feat.advancedProjects"), t("pricing.feat.zipDownloads"), t("pricing.feat.preview"), t("pricing.feat.advancedUploads"), t("pricing.feat.voice"), t("pricing.feat.noAds"), t("pricing.feat.promo"), t("pricing.feat.team"), t("pricing.feat.invite", { n: p.maxTeamInvites })];
  return [t("pricing.feat.custom1"), t("pricing.feat.custom2"), t("pricing.feat.custom3"), t("pricing.feat.team")];
}

function period(hours: number, t: (k: TKey, v?: any) => string) {
  return hours % 24 === 0 && hours >= 48 ? t("pricing.days", { n: hours / 24 }) : t("pricing.hours", { n: hours });
}

function Checkout({ plan, onClose }: { plan: PlanInfo; onClose: () => void }) {
  const { t, locale, errorText } = useI18n();
  const { config } = useSession();
  const providers = (["stripe", "paypal"] as const).filter((p) => config?.payments[p]);
  const [provider, setProvider] = useState<"stripe" | "paypal">(providers[0] || "stripe");
  const [code, setCode] = useState("");
  const [promo, setPromo] = useState<{ code: string; discountCents: number; finalCents: number } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const price = Math.round(plan.priceUsd * 100);
  const apply = async () => {
    setError("");
    try {
      setPromo(await api.post("/api/billing/promo/validate", { code, plan: plan.id }));
    } catch (e) {
      setPromo(null);
      setError(errorText(e));
    }
  };
  const go = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api.post("/api/billing/checkout", { plan: plan.id, provider, promoCode: promo?.code });
      if (r.url) window.location.href = r.url;
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  const name = t(`plan.${plan.id}` as TKey);
  return (
    <Modal
      open
      onClose={onClose}
      title={t("pricing.checkoutTitle", { plan: name })}
      footer={
        providers.length ? (
          <button className="btn primary block" onClick={go} disabled={busy}>
            {busy && <Loader2 size={15} className="spin" />} {t("pricing.checkout")}
          </button>
        ) : undefined
      }
    >
      {!providers.length ? (
        <div className="alert info">{t("pricing.noProviders")} <a className="link" href={`mailto:${config?.app.email}`}>{config?.app.email}</a></div>
      ) : (
        <div className="stack" style={{ gap: 18 }}>
          <div className="field">
            <span>{t("pricing.payWith")}</span>
            <div className="seg" style={{ width: "100%" }}>
              {providers.map((p) => (
                <button key={p} className={provider === p ? "active" : ""} style={{ flex: 1, justifyContent: "center", height: 34 }} onClick={() => setProvider(p)}>
                  {p === "stripe" ? "Card · Stripe" : "PayPal"}
                </button>
              ))}
            </div>
          </div>
          {plan.promoEligible && (
            <div className="field">
              <span>{t("pricing.promo")} <span className="dim">({t("common.optional")})</span></span>
              <div className="row">
                <input className="input mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODE" maxLength={40} />
                <button className="btn" onClick={apply} disabled={!code.trim()}>{t("pricing.apply")}</button>
              </div>
              <small>{t("pricing.promoNote")}</small>
            </div>
          )}
          <dl className="kv" style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 10 }}>
            <dt>{name}</dt>
            <dd style={{ textAlign: "right" }}>{money(price, locale)}</dd>
            {promo && (
              <>
                <dt>{t("pricing.discount")} · <span className="mono">{promo.code}</span></dt>
                <dd style={{ textAlign: "right", color: "var(--success)" }}>−{money(promo.discountCents, locale)}</dd>
              </>
            )}
            <dt style={{ color: "var(--text-primary)", fontWeight: 600 }}>{t("pricing.total")}</dt>
            <dd style={{ textAlign: "right", fontWeight: 650 }}>{money(promo ? promo.finalCents : price, locale)}</dd>
          </dl>
          {promo && <small className="dim">{t("pricing.then", { price: money(price, locale) })}</small>}
          {error && <div className="alert error">{error}</div>}
          <small className="dim">{t("pricing.secure", { provider: provider === "stripe" ? "Stripe" : "PayPal" })}</small>
        </div>
      )}
    </Modal>
  );
}

export function PlanGrid({ inApp }: { inApp?: boolean }) {
  const { t, locale } = useI18n();
  const { config, user } = useSession();
  const navigate = useNavigate();
  const [checkout, setCheckout] = useState<PlanInfo | null>(null);
  const [params] = useSearchParams();
  useEffect(() => {
    const want = params.get("plan");
    const p = config?.plans.find((x) => x.id === want);
    if (user && p && (p.id === "pro" || p.id === "premium") && user.plan !== p.id) setCheckout(p);
  }, [params, config, user]);
  if (!config) return null;
  const order = ["free", "pro", "premium", "custom"];
  const plans = [...config.plans].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const choose = (p: PlanInfo) => {
    if (!user) return navigate(`/register?next=${encodeURIComponent(`/app/pricing?plan=${p.id}`)}`);
    if (!user.emailVerified) return navigate("/verify-email");
    setCheckout(p);
  };
  return (
    <>
      <div className="plans">
        {plans.map((p) => {
          const current = user?.plan === p.id;
          return (
            <div key={p.id} className={`plan ${p.id === "premium" ? "featured" : ""}`}>
              {p.id === "premium" && <span className="badge primary ribbon">{t("pricing.popular")}</span>}
              <h3>{t(`plan.${p.id}` as TKey)}</h3>
              <div className="price">
                {p.id === "custom" ? <span style={{ fontSize: 26 }}>{t("pricing.contact")}</span> : <>{money(p.priceUsd * 100, locale).replace(/\.00$/, "").replace(/,00\s/, " ")}<small>{t("pricing.month")}</small></>}
              </div>
              <div className="allow">{p.id !== "custom" && t("pricing.tokensEvery", { n: formatNumber(p.tokenLimit, locale), period: period(p.resetHours, t) })}</div>
              <ul>
                {features(p, t).map((f) => (
                  <li key={f}><Check size={14} /> {f}</li>
                ))}
              </ul>
              {p.id === "custom" ? (
                <a className="btn block" href={`mailto:${config.app.email}?subject=OBSYDIA%20AI%20Custom%20plan`}>{t("pricing.contact")}</a>
              ) : current ? (
                <button className="btn block" disabled>{t("pricing.current")}</button>
              ) : p.id === "free" ? (
                <Link className="btn block" to={user ? "/app" : "/register"}>{t("pricing.getStarted")}</Link>
              ) : (
                <button className={`btn block ${p.id === "premium" ? "primary" : ""}`} onClick={() => choose(p)}>
                  {t("pricing.choose", { plan: t(`plan.${p.id}` as TKey) })}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {checkout && <Checkout plan={checkout} onClose={() => setCheckout(null)} />}
      {inApp && null}
    </>
  );
}

export function PricingPublic() {
  const { t } = useI18n();
  return (
    <SitePage>
      <section className="section" style={{ borderBottom: 0 }}>
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
    </SitePage>
  );
}

export function PricingApp() {
  const { t } = useI18n();
  return (
    <div className="content">
      <div className="page" style={{ maxWidth: 1240 }}>
        <div className="page-head has-toggle-pad">
          <div>
            <h1>{t("pricing.title")}</h1>
            <p>{t("pricing.sub")}</p>
          </div>
        </div>
        <PlanGrid inApp />
      </div>
    </div>
  );
}
