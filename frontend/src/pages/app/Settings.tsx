import { useEffect, useState } from "react";
import { Monitor, Loader2 } from "lucide-react";
import { api, formatDate } from "../../lib/api";
import { useI18n, type TKey } from "../../lib/i18n";
import { useSession } from "../../lib/session";
import { useToast } from "../../components/Toast";
import { LanguageSwitch } from "../../components/LanguageSwitch";

export function Settings() {
  const { t, locale, errorText } = useI18n();
  const { user, setUser } = useSession();
  const toast = useToast();
  const [name, setName] = useState(user!.name);
  const [aiLang, setAiLang] = useState(user!.preferences.aiLanguage);
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
  return (
    <div className="content">
      <div className="page" style={{ maxWidth: 820 }}>
        <div className="page-head"><div><h1>{t("settings.title")}</h1></div></div>
        <div className="stack" style={{ gap: 16 }}>
          <section className="card card-pad stack" style={{ gap: 16 }}>
            <span className="section-title" style={{ margin: 0 }}>{t("settings.profile")}</span>
            <dl className="kv">
              <dt>{t("common.email")}</dt><dd className="mono">{user!.email}</dd>
              <dt>{t("settings.plan")}</dt><dd>{t(`plan.${user!.plan}` as TKey)}</dd>
              <dt>{t("settings.memberSince")}</dt><dd>{formatDate(user!.createdAt, locale, false)}</dd>
            </dl>
            <label className="field"><span>{t("auth.name")}</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></label>
            <div className="field"><span>{t("settings.language")}</span><div><LanguageSwitch /></div></div>
            <label className="field">
              <span>{t("settings.aiLanguage")}</span>
              <select className="select" value={aiLang} onChange={(e) => setAiLang(e.target.value as any)}>
                <option value="auto">{t("settings.auto")}</option>
                <option value="en">English</option>
                <option value="fr">Français</option>
              </select>
            </label>
            <div>
              <button className="btn primary" disabled={busy === "profile"} onClick={() => run("profile", async () => { const r = await api.patch("/api/auth/profile", { name, aiLanguage: aiLang }); setUser(r.user); toast(t("common.saved")); })}>
                {busy === "profile" && <Loader2 size={15} className="spin" />} {t("common.save")}
              </button>
            </div>
          </section>

          <section className="card card-pad stack" style={{ gap: 16 }}>
            <span className="section-title" style={{ margin: 0 }}>{t("settings.changePassword")}</span>
            {user!.hasPassword && <label className="field"><span>{t("settings.currentPassword")}</span><input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>}
            <label className="field"><span>{t("auth.newPassword")}</span><input className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /><small>{t("auth.passwordHint")}</small></label>
            <div><button className="btn" disabled={pw.next.length < 10 || busy === "pw"} onClick={() => run("pw", async () => { await api.post("/api/auth/change-password", { currentPassword: pw.current || undefined, newPassword: pw.next }); setPw({ current: "", next: "" }); toast(t("common.saved")); void loadSessions(); })}>{t("settings.changePassword")}</button></div>
          </section>

          <section className="card card-pad stack" style={{ gap: 16 }}>
            <span className="section-title" style={{ margin: 0 }}>{t("settings.changeEmail")}</span>
            {!em.sent ? (
              <>
                <label className="field"><span>{t("settings.newEmail")}</span><input className="input" type="email" value={em.email} onChange={(e) => setEm({ ...em, email: e.target.value })} /></label>
                {user!.hasPassword && <label className="field"><span>{t("auth.password")}</span><input className="input" type="password" value={em.password} onChange={(e) => setEm({ ...em, password: e.target.value })} /></label>}
                <div><button className="btn" disabled={!em.email || busy === "em"} onClick={() => run("em", async () => { await api.post("/api/auth/change-email", { newEmail: em.email, password: em.password || undefined }); setEm({ ...em, sent: true }); })}>{t("common.continue")}</button></div>
              </>
            ) : (
              <>
                <div className="alert info">{t("settings.emailCodeSent", { email: em.email })}</div>
                <input className="input code-input" inputMode="numeric" maxLength={6} value={em.code} onChange={(e) => setEm({ ...em, code: e.target.value.replace(/\D/g, "") })} />
                <div><button className="btn primary" disabled={em.code.length !== 6 || busy === "emc"} onClick={() => run("emc", async () => { const r = await api.post("/api/auth/confirm-email-change", { code: em.code }); setUser(r.user); setEm({ email: "", password: "", code: "", sent: false }); toast(t("common.saved")); })}>{t("settings.confirmEmail")}</button></div>
              </>
            )}
          </section>

          <section className="card card-pad">
            <span className="section-title">{t("settings.sessions")}</span>
            <div className="stack" style={{ gap: 2 }}>
              {sessions.map((s) => (
                <div key={s.id} className="row" style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                  <Monitor size={16} color="var(--text-tertiary)" />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="truncate" style={{ fontSize: 13.5 }}>{s.userAgent || "—"}</div>
                    <div className="dim" style={{ fontSize: 12 }}>{formatDate(s.lastSeenAt, locale)}</div>
                  </div>
                  {s.current ? <span className="badge success">{t("settings.thisDevice")}</span> : <button className="btn sm ghost" onClick={() => run("s", async () => { await api.del(`/api/auth/sessions/${s.id}`); await loadSessions(); })}>{t("settings.revoke")}</button>}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
