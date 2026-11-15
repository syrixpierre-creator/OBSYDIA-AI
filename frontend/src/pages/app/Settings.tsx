import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Monitor, Smartphone, Loader2, User, SlidersHorizontal, Shield, Laptop } from "lucide-react";
import { api, formatDate, formatNumber, relativeTime } from "../../lib/api";
import { useI18n, type TKey } from "../../lib/i18n";
import { useSession } from "../../lib/session";
import { useToast } from "../../components/Toast";

function Row({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-row-text">
        <div className="set-row-title">{title}</div>
        {desc && <div className="set-row-desc">{desc}</div>}
      </div>
      <div className="set-row-control">{children}</div>
    </div>
  );
}

function deviceLabel(ua: string) {
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return { label: `${browser}${os ? ` · ${os}` : ""}`, mobile: /Android|iPhone|iPad|Mobile/.test(ua) };
}

type Section = "profile" | "preferences" | "security";

export function Settings() {
  const { t, locale, setLocale, errorText } = useI18n();
  const { user, setUser, balance } = useSession();
  const toast = useToast();
  const [section, setSection] = useState<Section>("profile");
  const [name, setName] = useState(user!.name);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [em, setEm] = useState({ email: "", password: "", code: "", sent: false });
  const [sessions, setSessions] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const loadSessions = () => api.get("/api/auth/sessions").then((r) => setSessions(r.sessions)).catch(() => undefined);
  useEffect(() => {
    void loadSessions();
  }, []);
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(null);
    }
  };
  const savePref = (patch: Record<string, string>) =>
    run("pref", async () => {
      const r = await api.patch("/api/auth/profile", patch);
      setUser(r.user);
      toast(t("common.saved"));
    });
  const nav: { id: Section; icon: any; label: string }[] = [
    { id: "profile", icon: User, label: t("settings.profile") },
    { id: "preferences", icon: SlidersHorizontal, label: t("settings.preferences") },
    { id: "security", icon: Shield, label: t("settings.security") }
  ];
  const others = sessions.filter((s) => !s.current);

  return (
    <div className="content">
      <div className="page set-page">
        <div className="set-hero">
          <div className="set-avatar">{user!.name.slice(0, 1).toUpperCase()}</div>
          <div className="grow" style={{ minWidth: 0 }}>
            <h1 className="truncate">{user!.name}</h1>
            <div className="muted truncate" style={{ fontSize: 14 }}>{user!.email}</div>
          </div>
          <span className="badge primary">{t(`plan.${user!.plan}` as TKey)}</span>
        </div>
        <div className="set-layout">
          <nav className="set-nav">
            {nav.map((n) => (
              <button key={n.id} className={section === n.id ? "active" : ""} onClick={() => setSection(n.id)}>
                <n.icon size={16} /> {n.label}
              </button>
            ))}
          </nav>
          <div className="set-body">
            {section === "profile" && (
              <>
                <div className="set-group">
                  <div className="set-group-head">{t("settings.profile")}</div>
                  <Row title={t("auth.name")} desc={t("settings.nameDesc")}>
                    <div className="row">
                      <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} style={{ width: 220 }} />
                      <button className="btn" disabled={name.trim() === user!.name || name.trim().length < 2 || busy === "name"} onClick={() => run("name", async () => { const r = await api.patch("/api/auth/profile", { name: name.trim() }); setUser(r.user); toast(t("common.saved")); })}>{t("common.save")}</button>
                    </div>
                  </Row>
                  <Row title={t("common.email")} desc={t("settings.emailDesc")}>
                    <span className="mono" style={{ fontSize: 13.5 }}>{user!.email}</span>
                  </Row>
                  <Row title={t("settings.memberSince")}>
                    <span className="muted">{formatDate(user!.createdAt, locale, false)}</span>
                  </Row>
                </div>
                <div className="set-group">
                  <div className="set-group-head">{t("settings.plan")}</div>
                  <Row title={t(`plan.${user!.plan}` as TKey)} desc={balance ? `${formatNumber(balance.remaining, locale)} / ${formatNumber(balance.total, locale)} ${t("common.tokens")} · ${t("nav.resets", { when: relativeTime(balance.resetAt, locale) })}` : t("settings.planDesc")}>
                    <Link to="/app/billing" className="btn">{t("settings.manage")}</Link>
                  </Row>
                </div>
              </>
            )}
            {section === "preferences" && (
              <div className="set-group">
                <div className="set-group-head">{t("settings.preferences")}</div>
                <Row title={t("settings.language")} desc={t("settings.languageDesc")}>
                  <select className="select" style={{ width: 200 }} value={locale} onChange={(e) => { const l = e.target.value as "en" | "fr"; setLocale(l); void savePref({ locale: l }); }}>
                    <option value="en">English</option>
                    <option value="fr">Français</option>
                  </select>
                </Row>
                <Row title={t("settings.aiLanguage")} desc={t("settings.aiLanguageDesc")}>
                  <select className="select" style={{ width: 200 }} value={user!.preferences.aiLanguage} onChange={(e) => void savePref({ aiLanguage: e.target.value })}>
                    <option value="auto">{t("settings.auto")}</option>
                    <option value="en">English</option>
                    <option value="fr">Français</option>
                  </select>
                </Row>
              </div>
            )}
            {section === "security" && (
              <>
                <div className="set-group">
                  <div className="set-group-head">{t("settings.changePassword")}</div>
                  <div className="set-form">
                    <p className="set-row-desc" style={{ margin: 0 }}>{t("settings.passwordDesc")}</p>
                    <div className="grid cols-2">
                      {user!.hasPassword && <label className="field"><span>{t("settings.currentPassword")}</span><input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>}
                      <label className="field"><span>{t("auth.newPassword")}</span><input className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /><small>{t("auth.passwordHint")}</small></label>
                    </div>
                    <div><button className="btn primary" disabled={pw.next.length < 10 || busy === "pw"} onClick={() => run("pw", async () => { await api.post("/api/auth/change-password", { currentPassword: pw.current || undefined, newPassword: pw.next }); setPw({ current: "", next: "" }); toast(t("common.saved")); void loadSessions(); })}>{busy === "pw" && <Loader2 size={14} className="spin" />} {t("settings.changePassword")}</button></div>
                  </div>
                </div>
                <div className="set-group">
                  <div className="set-group-head">{t("settings.changeEmail")}</div>
                  <div className="set-form">
                    <p className="set-row-desc" style={{ margin: 0 }}>{t("settings.emailChangeDesc")}</p>
                    {!em.sent ? (
                      <>
                        <div className="grid cols-2">
                          <label className="field"><span>{t("settings.newEmail")}</span><input className="input" type="email" value={em.email} onChange={(e) => setEm({ ...em, email: e.target.value })} /></label>
                          {user!.hasPassword && <label className="field"><span>{t("auth.password")}</span><input className="input" type="password" value={em.password} onChange={(e) => setEm({ ...em, password: e.target.value })} /></label>}
                        </div>
                        <div><button className="btn" disabled={!em.email || busy === "em"} onClick={() => run("em", async () => { await api.post("/api/auth/change-email", { newEmail: em.email, password: em.password || undefined }); setEm({ ...em, sent: true }); })}>{t("common.continue")}</button></div>
                      </>
                    ) : (
                      <>
                        <div className="alert info">{t("settings.emailCodeSent", { email: em.email })}</div>
                        <input className="input code-input" style={{ maxWidth: 260 }} inputMode="numeric" maxLength={6} value={em.code} onChange={(e) => setEm({ ...em, code: e.target.value.replace(/\D/g, "") })} />
                        <div><button className="btn primary" disabled={em.code.length !== 6 || busy === "emc"} onClick={() => run("emc", async () => { const r = await api.post("/api/auth/confirm-email-change", { code: em.code }); setUser(r.user); setEm({ email: "", password: "", code: "", sent: false }); toast(t("common.saved")); })}>{t("settings.confirmEmail")}</button></div>
                      </>
                    )}
                  </div>
                </div>
                <div className="set-group">
                  <div className="set-group-head row" style={{ justifyContent: "space-between" }}>
                    <span>{t("settings.sessions")}</span>
                    {others.length > 0 && <button className="btn sm ghost" onClick={() => run("all", async () => { for (const s of others) await api.del(`/api/auth/sessions/${s.id}`); await loadSessions(); })}>{t("settings.signOutAll")}</button>}
                  </div>
                  {sessions.map((s) => {
                    const dev = deviceLabel(s.userAgent || "");
                    return (
                      <div key={s.id} className="set-row">
                        <div className="row" style={{ gap: 12, minWidth: 0 }}>
                          <div className="set-device">{dev.mobile ? <Smartphone size={16} /> : s.userAgent ? <Laptop size={16} /> : <Monitor size={16} />}</div>
                          <div style={{ minWidth: 0 }}>
                            <div className="set-row-title">{dev.label}</div>
                            <div className="set-row-desc">{relativeTime(s.lastSeenAt, locale)}</div>
                          </div>
                        </div>
                        <div className="set-row-control">
                          {s.current ? <span className="badge success">{t("settings.thisDevice")}</span> : <button className="btn sm" onClick={() => run("s", async () => { await api.del(`/api/auth/sessions/${s.id}`); await loadSessions(); })}>{t("settings.revoke")}</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
