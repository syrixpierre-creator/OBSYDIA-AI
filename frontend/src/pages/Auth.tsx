import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, MailCheck, CheckCircle2 } from "lucide-react";
import { Logo } from "../components/Logo";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useSession } from "../lib/session";

function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { config } = useSession();
  return (
    <div className="auth">
      <div className="auth-side">
        <img className="bg" src="/obsydia-hero.jpg" alt="" />
        <Logo />
        <div>
          <div className="auth-quote">{t("landing.sub")}</div>
          <p className="muted" style={{ marginTop: 14 }}>{t("brand.tagline")}</p>
          <p className="dim" style={{ marginTop: 24, fontSize: 13 }}>{config?.app.creator} · {config?.app.company}</p>
        </div>
      </div>
      <div className="auth-main">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="auth-mobile-logo"><Logo /></span>
          <LanguageSwitch />
        </div>
        <div className="auth-card">{children}</div>
      </div>
    </div>
  );
}

function GoogleButton({ refCode }: { refCode?: string | null }) {
  const { t } = useI18n();
  const { config } = useSession();
  if (!config?.auth.google) return null;
  return (
    <>
      <a className="btn block lg" href={`/api/auth/google${refCode ? `?ref=${encodeURIComponent(refCode)}` : ""}`}>
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        {t("auth.google")}
      </a>
      <div className="or">{t("auth.or")}</div>
    </>
  );
}

export function Login() {
  const { t, errorText } = useI18n();
  const { user, setUser } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(params.get("error") ? t("err.generic") : "");
  const [busy, setBusy] = useState(false);
  const next = params.get("next") || "/app";
  if (user?.emailVerified) return <Navigate to={next} replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api.post("/api/auth/login", { email, password });
      setUser(r.user);
      navigate(r.user.emailVerified ? next : "/verify-email", { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout>
      <h1>{t("auth.loginTitle")}</h1>
      <p className="sub">{t("auth.loginSub")}</p>
      <GoogleButton />
      <form className="stack" onSubmit={submit} style={{ gap: 16 }}>
        <label className="field">
          <span>{t("auth.email")}</span>
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span className="row" style={{ justifyContent: "space-between" }}>
            {t("auth.password")}
            <Link to="/forgot-password" className="link" style={{ fontSize: 13 }}>{t("auth.forgot")}</Link>
          </span>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className="alert error">{error}</div>}
        <button className="btn primary lg block" disabled={busy}>{busy && <Loader2 size={16} className="spin" />} {t("auth.login")}</button>
      </form>
      <p className="auth-foot">{t("auth.noAccount")} <Link to={`/register${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`}>{t("nav.signup")}</Link></p>
    </AuthLayout>
  );
}

export function Register() {
  const { t, locale, errorText } = useI18n();
  const { user, setUser } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ref = params.get("ref") || (() => {
    try {
      return localStorage.getItem("obs_ref");
    } catch {
      return null;
    }
  })();
  useEffect(() => {
    const r = params.get("ref");
    if (r) try { localStorage.setItem("obs_ref", r); } catch {}
  }, [params]);
  const [form, setForm] = useState({ name: "", email: "", password: "", website: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (user?.emailVerified) return <Navigate to="/app" replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api.post("/api/auth/signup", { ...form, website: form.website || undefined, locale, ref: ref || undefined });
      try { localStorage.removeItem("obs_ref"); } catch {}
      setUser(r.user);
      navigate(`/verify-email${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`, { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout>
      <h1>{t("auth.signupTitle")}</h1>
      <p className="sub">{t("auth.signupSub")}</p>
      {ref && <div className="alert info" style={{ marginBottom: 18 }}>{t("auth.referred")}</div>}
      <GoogleButton refCode={ref} />
      <form className="stack" onSubmit={submit} style={{ gap: 16 }}>
        <label className="field">
          <span>{t("auth.name")}</span>
          <input className="input" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} maxLength={80} />
        </label>
        <label className="field">
          <span>{t("auth.email")}</span>
          <input className="input" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </label>
        <label className="field">
          <span>{t("auth.password")}</span>
          <input className="input" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={10} />
          <small>{t("auth.passwordHint")}</small>
        </label>
        <input className="sr-only" tabIndex={-1} autoComplete="off" aria-hidden value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} name="website" />
        {error && <div className="alert error">{error}</div>}
        <button className="btn primary lg block" disabled={busy}>{busy && <Loader2 size={16} className="spin" />} {t("auth.signup")}</button>
        <small className="dim" style={{ textAlign: "center" }}>{t("auth.terms")}</small>
      </form>
      <p className="auth-foot">{t("auth.haveAccount")} <Link to="/login">{t("nav.login")}</Link></p>
    </AuthLayout>
  );
}

export function VerifyEmail() {
  const { t, errorText } = useI18n();
  const { user, setUser, refreshUser, logout } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ kind: "error" | "success" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkDone, setLinkDone] = useState(false);
  useEffect(() => {
    if (!token) return;
    void (async () => {
      setBusy(true);
      try {
        await api.post("/api/auth/verify-email", { token });
        setLinkDone(true);
        await refreshUser();
      } catch (e) {
        setMsg({ kind: "error", text: errorText(e) });
      } finally {
        setBusy(false);
      }
    })();
  }, [token, refreshUser, errorText]);
  if (!token && !user) return <Navigate to="/login" replace />;
  if (!token && user?.emailVerified) return <Navigate to={params.get("next") || "/app"} replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.post("/api/auth/verify-email", { code });
      setUser(r.user);
      navigate(params.get("next") || "/app", { replace: true });
    } catch (err) {
      setMsg({ kind: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };
  if (token) {
    return (
      <AuthLayout>
        {busy ? <Loader2 className="spin" /> : linkDone ? (
          <div className="stack">
            <CheckCircle2 size={36} color="var(--success)" />
            <h1>{t("auth.verified")}</h1>
            <Link className="btn primary lg" to={user ? "/app" : "/login"}>{t("common.continue")}</Link>
          </div>
        ) : (
          <div className="stack">
            {msg && <div className="alert error">{msg.text}</div>}
            <Link className="btn" to="/login">{t("auth.backToLogin")}</Link>
          </div>
        )}
      </AuthLayout>
    );
  }
  return (
    <AuthLayout>
      <MailCheck size={32} color="var(--primary)" />
      <h1 style={{ marginTop: 14 }}>{t("auth.verifyTitle")}</h1>
      <p className="sub">{t("auth.verifySub", { email: user?.email || "" })}</p>
      <form className="stack" onSubmit={submit} style={{ gap: 16 }}>
        <label className="field">
          <span>{t("auth.verifyCode")}</span>
          <input className="input code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required autoFocus />
        </label>
        {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}
        <button className="btn primary lg block" disabled={busy || code.length !== 6}>{busy && <Loader2 size={16} className="spin" />} {t("auth.verify")}</button>
      </form>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 18 }}>
        <button
          className="link"
          onClick={async () => {
            try {
              await api.post("/api/auth/resend-verification");
              setMsg({ kind: "success", text: t("auth.resent") });
            } catch (e) {
              setMsg({ kind: "error", text: errorText(e) });
            }
          }}
        >
          {t("auth.resend")}
        </button>
        <button className="btn ghost sm" onClick={async () => { await logout(); navigate("/login"); }}>{t("auth.useDifferent")}</button>
      </div>
    </AuthLayout>
  );
}

export function ForgotPassword() {
  const { t, errorText } = useI18n();
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <AuthLayout>
      <h1>{t("auth.forgotTitle")}</h1>
      <p className="sub">{t("auth.forgotSub")}</p>
      {done ? (
        <div className="alert success">{t("auth.linkSent")}</div>
      ) : (
        <form
          className="stack"
          style={{ gap: 16 }}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api.post("/api/auth/forgot-password", { email });
              setDone(true);
            } catch (err) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            <span>{t("auth.email")}</span>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          {error && <div className="alert error">{error}</div>}
          <button className="btn primary lg block" disabled={busy}>{t("auth.sendLink")}</button>
        </form>
      )}
      <p className="auth-foot"><Link to="/login">{t("auth.backToLogin")}</Link></p>
    </AuthLayout>
  );
}

export function ResetPassword() {
  const { t, errorText } = useI18n();
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <AuthLayout>
      <h1>{t("auth.resetTitle")}</h1>
      <p className="sub">{t("auth.passwordHint")}</p>
      {done ? (
        <div className="stack">
          <div className="alert success">{t("auth.resetDone")}</div>
          <Link className="btn primary lg" to="/login">{t("auth.login")}</Link>
        </div>
      ) : (
        <form
          className="stack"
          style={{ gap: 16 }}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api.post("/api/auth/reset-password", { token: params.get("token"), password });
              setDone(true);
            } catch (err) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            <span>{t("auth.newPassword")}</span>
            <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} autoFocus />
          </label>
          {error && <div className="alert error">{error}</div>}
          <button className="btn primary lg block" disabled={busy}>{t("common.save")}</button>
        </form>
      )}
    </AuthLayout>
  );
}
