import { useEffect, useState } from "react";
import { Plus, Trash2, Play, RotateCcw, Loader2, Search, ShieldOff, ShieldCheck as Shield } from "lucide-react";
import { api, compact, formatDate, formatNumber, money, relativeTime } from "../../lib/api";
import { useI18n, type TKey } from "../../lib/i18n";
import { Modal, Confirm } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { Bars } from "../../components/Bars";

type Tab = "overview" | "users" | "ai" | "keys" | "ads" | "plans" | "promos" | "payments" | "subscriptions" | "teams" | "referrals" | "audit";

function useLoad<T>(url: string, deps: unknown[] = []) {
  const { errorText } = useI18n();
  const toast = useToast();
  const [data, setData] = useState<T | null>(null);
  const reload = () => api.get<T>(url).then(setData).catch((e) => toast(errorText(e), "error"));
  useEffect(() => {
    void reload();
  }, [url, ...deps]);
  return { data, reload };
}

function Overview() {
  const { t, locale } = useI18n();
  const { data } = useLoad<any>("/api/admin/stats");
  if (!data) return <div className="skeleton" style={{ height: 300 }} />;
  const s = (label: string, v: string | number, sub?: string) => (
    <div className="card stat"><span className="label">{label}</span><div className="v">{v}</div>{sub && <div className="s">{sub}</div>}</div>
  );
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="grid cols-4">
        {s(t("admin.users"), formatNumber(data.users.total, locale), `+${data.users.new30d} · 30d`)}
        {s("Active 7d", formatNumber(data.users.active7d, locale))}
        {s("Revenue", money(data.revenue.totalCents, locale), `${data.revenue.payments} payments · ${data.revenue.failedPayments} failed`)}
        {s("Tokens 30d", compact(data.tokens.consumed30d, locale), `${formatNumber(data.tokens.requests30d, locale)} requests`)}
      </div>
      <div className="grid cols-4">
        {s("Free", data.users.free)}
        {s("Pro", data.users.pro)}
        {s("Premium", data.users.premium)}
        {s("Custom", data.users.custom)}
      </div>
      <div className="grid cols-4">
        {s("API requests 30d", formatNumber(data.api.requests30d, locale))}
        {s(t("nav.projects"), formatNumber(data.projects.total, locale))}
        {s(t("admin.referrals"), `${data.referrals.qualified} / ${data.referrals.pending + data.referrals.qualified}`, `${data.referrals.rewards} rewards · ${compact(data.referrals.rewardTokens, locale)} tokens`)}
        {s(t("admin.keys"), `${data.provider.ready} / ${data.provider.total}`, data.provider.nextReadyAt ? `next ${relativeTime(new Date(data.provider.nextReadyAt), locale)}` : "ready")}
      </div>
      <div className="grid cols-2">
        <div className="card card-pad"><span className="section-title">Registrations</span><Bars data={data.series.registrations} locale={locale} /></div>
        <div className="card card-pad"><span className="section-title">Token consumption</span><Bars data={data.series.tokens} locale={locale} /></div>
      </div>
    </div>
  );
}

function Users() {
  const { t, locale, errorText } = useI18n();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const { data, reload } = useLoad<any>(`/api/admin/users?page=${page}${query ? `&q=${encodeURIComponent(query)}` : ""}`);
  const [detail, setDetail] = useState<any>(null);
  const [tokens, setTokens] = useState({ amount: "", note: "" });
  const open = async (id: string) => setDetail(await api.get(`/api/admin/users/${id}`));
  const act = async (fn: () => Promise<any>) => {
    try {
      await fn();
      await reload();
      if (detail) await open(detail.user.id);
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  return (
    <div className="stack" style={{ gap: 12 }}>
      <form className="row" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q); }}>
        <input className="input" placeholder={`${t("common.search")}…`} value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360 }} />
        <button className="btn"><Search size={15} /></button>
      </form>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{t("common.name")}</th><th>{t("common.email")}</th><th>{t("settings.plan")}</th><th>{t("common.status")}</th><th>Last active</th><th /></tr></thead>
          <tbody>
            {data?.users.map((u: any) => (
              <tr key={u.id}>
                <td>{u.name} {u.role === "admin" && <span className="badge primary">admin</span>}</td>
                <td className="mono">{u.email} {!u.emailVerified && <span className="badge warning">unverified</span>}</td>
                <td>{t(`plan.${u.plan}` as TKey)}</td>
                <td><span className={`badge ${u.status === "active" ? "success" : "error"}`}>{u.status}</span></td>
                <td>{u.lastActiveAt ? relativeTime(u.lastActiveAt, locale) : "—"}</td>
                <td style={{ textAlign: "right" }}><button className="btn sm" onClick={() => open(u.id)}>{t("common.edit")}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.total > 25 && (
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <span className="dim" style={{ fontSize: 13 }}>{data.total}</span>
          <button className="btn sm" disabled={page === 1} onClick={() => setPage(page - 1)}>{t("common.previous")}</button>
          <button className="btn sm" disabled={page * 25 >= data.total} onClick={() => setPage(page + 1)}>{t("common.next")}</button>
        </div>
      )}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.user.email} width={680}>
        {detail && (
          <div className="stack" style={{ gap: 18 }}>
            <dl className="kv">
              <dt>{t("common.name")}</dt><dd>{detail.user.name}</dd>
              <dt>Created</dt><dd>{formatDate(detail.user.createdAt, locale)}</dd>
              <dt>Balance</dt><dd className="mono">{formatNumber(detail.balance.remaining, locale)} / {formatNumber(detail.balance.total, locale)} (bonus {formatNumber(detail.balance.bonus, locale)})</dd>
              <dt>Usage</dt><dd>{detail.stats.messages} messages · {detail.stats.projects} projects · {detail.stats.qualifiedReferrals} referrals</dd>
              {detail.user.suspendedReason && <><dt>Suspended</dt><dd>{detail.user.suspendedReason}</dd></>}
            </dl>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <label className="field" style={{ width: 160 }}>
                <span>{t("settings.plan")}</span>
                <select className="select" value={detail.user.plan} onChange={(e) => act(() => api.patch(`/api/admin/users/${detail.user.id}`, { plan: e.target.value }))}>
                  {["free", "pro", "premium", "custom"].map((p) => <option key={p} value={p}>{t(`plan.${p}` as TKey)}</option>)}
                </select>
              </label>
              <label className="field" style={{ width: 140 }}>
                <span>Role</span>
                <select className="select" value={detail.user.role} onChange={(e) => act(() => api.patch(`/api/admin/users/${detail.user.id}`, { role: e.target.value }))}>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <div style={{ alignSelf: "flex-end" }}>
                {detail.user.status === "active" ? (
                  <button className="btn danger" onClick={() => { const reason = prompt("Reason") ?? ""; void act(() => api.post(`/api/admin/users/${detail.user.id}/suspend`, { reason })); }}><ShieldOff size={15} /> Suspend</button>
                ) : (
                  <button className="btn" onClick={() => act(() => api.post(`/api/admin/users/${detail.user.id}/reactivate`))}><Shield size={15} /> Reactivate</button>
                )}
              </div>
            </div>
            <div className="card card-pad stack">
              <span className="label">Token adjustment</span>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <input className="input" style={{ width: 140 }} type="number" placeholder="±10000" value={tokens.amount} onChange={(e) => setTokens({ ...tokens, amount: e.target.value })} />
                <input className="input grow" placeholder="Note" value={tokens.note} onChange={(e) => setTokens({ ...tokens, note: e.target.value })} />
                <button className="btn" disabled={!Number(tokens.amount) || tokens.note.length < 2} onClick={() => act(async () => { await api.post(`/api/admin/users/${detail.user.id}/tokens`, { amount: Number(tokens.amount), note: tokens.note }); setTokens({ amount: "", note: "" }); })}>{t("common.save")}</button>
              </div>
            </div>
            <div>
              <span className="label">Transactions</span>
              <div className="table-wrap" style={{ marginTop: 8, maxHeight: 220, overflowY: "auto" }}>
                <table className="table">
                  <tbody>
                    {detail.transactions.map((x: any) => (
                      <tr key={x._id}><td>{formatDate(x.createdAt, locale)}</td><td>{x.type}</td><td className="dim">{x.feature || x.note}</td><td className="mono" style={{ textAlign: "right" }}>{x.amount}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function AiConfig() {
  const { t, errorText } = useI18n();
  const toast = useToast();
  const { data, reload } = useLoad<any>("/api/admin/ai-settings");
  const [form, setForm] = useState<any>(null);
  const [remote, setRemote] = useState<string[] | null>(null);
  useEffect(() => {
    if (data)
      setForm({
        ...data.effective,
        models: data.effective.models.join("\n"),
        subEn: data.effective.welcomeSubtitle?.en ?? "",
        subFr: data.effective.welcomeSubtitle?.fr ?? "",
        sugEn: (data.effective.suggestions?.en || []).join("\n"),
        sugFr: (data.effective.suggestions?.fr || []).join("\n")
      });
  }, [data]);
  if (!form) return <div className="skeleton" style={{ height: 300 }} />;
  const save = async () => {
    try {
      await api.put("/api/admin/ai-settings", {
        displayName: form.displayName,
        personality: form.personality,
        systemPrompt: form.systemPrompt,
        welcomeMessage: form.welcomeMessage,
        welcomeMessageFr: form.welcomeMessageFr,
        welcomeSubtitle: { en: form.subEn, fr: form.subFr },
        suggestions: {
          en: form.sugEn.split("\n").map((s: string) => s.trim()).filter(Boolean).slice(0, 12),
          fr: form.sugFr.split("\n").map((s: string) => s.trim()).filter(Boolean).slice(0, 12)
        },
        defaultLanguage: form.defaultLanguage,
        model: form.model,
        models: form.models.split("\n").map((s: string) => s.trim()).filter(Boolean),
        capabilities: form.capabilities,
        maxOutputTokens: Number(form.maxOutputTokens)
      });
      toast(t("common.saved"));
      await reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  const reset = async () => {
    await api.put("/api/admin/ai-settings", {});
    await reload();
  };
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 820 }}>
      <div className="alert info">Values saved here override the .env defaults. Clearing restores the environment configuration.</div>
      <div className="grid cols-2">
        <label className="field"><span>AI display name</span><input className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></label>
        <label className="field"><span>Default language</span>
          <select className="select" value={form.defaultLanguage} onChange={(e) => setForm({ ...form, defaultLanguage: e.target.value })}>
            <option value="auto">auto</option><option value="en">en</option><option value="fr">fr</option>
          </select>
        </label>
      </div>
      <div className="card card-pad stack" style={{ gap: 16 }}>
        <span className="label">Chat welcome screen</span>
        <div className="grid cols-2">
          <label className="field"><span>Welcome message — English</span><input className="input" value={form.welcomeMessage} onChange={(e) => setForm({ ...form, welcomeMessage: e.target.value })} /></label>
          <label className="field"><span>Welcome message — Français</span><input className="input" value={form.welcomeMessageFr} onChange={(e) => setForm({ ...form, welcomeMessageFr: e.target.value })} /></label>
          <label className="field"><span>Subtitle — English</span><input className="input" value={form.subEn} onChange={(e) => setForm({ ...form, subEn: e.target.value })} /></label>
          <label className="field"><span>Subtitle — Français</span><input className="input" value={form.subFr} onChange={(e) => setForm({ ...form, subFr: e.target.value })} /></label>
          <label className="field"><span>Suggestions — English</span><textarea className="textarea" style={{ minHeight: 130 }} value={form.sugEn} onChange={(e) => setForm({ ...form, sugEn: e.target.value })} /></label>
          <label className="field"><span>Suggestions — Français</span><textarea className="textarea" style={{ minHeight: 130 }} value={form.sugFr} onChange={(e) => setForm({ ...form, sugFr: e.target.value })} /></label>
        </div>
        <small className="dim">One suggestion per line, up to 12. Start a line with <span className="mono">build:</span> to open it in project-builder mode. Leave the subtitle empty to hide it.</small>
      </div>
      <label className="field"><span>Personality</span><textarea className="textarea" style={{ minHeight: 120 }} value={form.personality} onChange={(e) => setForm({ ...form, personality: e.target.value })} /></label>
      <label className="field"><span>System prompt</span><textarea className="textarea mono" style={{ minHeight: 320, fontSize: 13, whiteSpace: "pre-wrap" }} spellCheck={false} value={form.systemPrompt} onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })} /><small>{form.systemPrompt.length.toLocaleString()} characters · ≈ {Math.ceil(form.systemPrompt.length / 3.6).toLocaleString()} tokens sent with every message — not deducted from users’ balances (up to 500,000 characters). Creator identity rules are always appended automatically.</small></label>
      <div className="grid cols-2">
        <label className="field"><span>Provider</span><input className="input" value={form.provider} disabled /></label>
        <label className="field"><span>Default model</span><input className="input mono" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></label>
      </div>
      <label className="field">
        <span className="row" style={{ justifyContent: "space-between" }}>Available models (one per line)
          <button className="link" style={{ fontSize: 12 }} onClick={async () => { const r = await api.get("/api/admin/provider-models"); setRemote(r.available ? r.models : []); }}>Fetch from provider</button>
        </span>
        <textarea className="textarea mono" style={{ fontSize: 13 }} value={form.models} onChange={(e) => setForm({ ...form, models: e.target.value })} />
        {remote && <small>{remote.length ? remote.slice(0, 40).join(" · ") : "The provider did not return a model list."}</small>}
      </label>
      <div className="field">
        <span>Verified model capabilities</span>
        <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
          {(["vision", "audio", "tools"] as const).map((c) => (
            <label key={c} className="check"><input type="checkbox" checked={form.capabilities[c]} onChange={(e) => setForm({ ...form, capabilities: { ...form.capabilities, [c]: e.target.checked } })} /> {c}</label>
          ))}
        </div>
        <small>Enable a capability only after confirming the model supports it.</small>
      </div>
      <label className="field" style={{ maxWidth: 220 }}><span>Max output tokens</span><input className="input" type="number" value={form.maxOutputTokens} onChange={(e) => setForm({ ...form, maxOutputTokens: e.target.value })} /></label>
      <div className="row"><button className="btn primary" onClick={save}>{t("common.save")}</button><button className="btn ghost" onClick={reset}>Reset to .env</button></div>
    </div>
  );
}

function Keys() {
  const { t, locale, errorText } = useI18n();
  const toast = useToast();
  const { data, reload } = useLoad<any>("/api/admin/provider-keys");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: "", owner: "", key: "" });
  const [testing, setTesting] = useState<string | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const add = async () => {
    try {
      const r = await api.post("/api/admin/provider-keys", { ...form, test: true });
      setAdding(false);
      setForm({ label: "", owner: "", key: "" });
      toast(r.test?.ok ? `OK · ${r.test.latencyMs} ms` : `Saved — test failed: ${r.test?.error}`, r.test?.ok ? "success" : "error");
      await reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  const test = async (fp: string) => {
    setTesting(fp);
    try {
      const r = await api.post(`/api/admin/provider-keys/${fp}/test`);
      toast(r.ok ? `OK · ${r.latencyMs} ms · ${r.model}` : `${r.status} ${r.error}`, r.ok ? "success" : "error");
      await reload();
    } finally {
      setTesting(null);
    }
  };
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 13.5 }}>
          {data && `${data.availability.ready} ready · ${data.availability.enabled} enabled · ${data.availability.total} total`} — round-robin with Retry-After cooldowns. Only add keys you are authorized to use.
        </span>
        <button className="btn primary" onClick={() => setAdding(true)}><Plus size={15} /> Add key</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Key</th><th>Source</th><th>{t("common.status")}</th><th>Requests</th><th>Errors</th><th>Tokens</th><th>Last success</th><th>Last error</th><th /></tr></thead>
          <tbody>
            {data?.keys.map((k: any) => (
              <tr key={k.fingerprint}>
                <td><div>{k.label}</div><div className="mono dim" style={{ fontSize: 12 }}>{k.masked}{k.owner ? ` · ${k.owner}` : ""}</div></td>
                <td><span className="badge">{k.source}</span></td>
                <td>
                  <span className={`badge ${k.status === "healthy" ? "success" : k.status === "cooldown" ? "warning" : k.status === "disabled" ? "" : "error"}`}>{k.status}</span>
                  {k.status === "cooldown" && <div className="dim" style={{ fontSize: 11 }}>{relativeTime(new Date(k.cooldownUntil), locale)}</div>}
                </td>
                <td className="mono">{formatNumber(k.totals.requests, locale)}<div className="dim" style={{ fontSize: 11 }}>today {k.today.requests}</div></td>
                <td className="mono">{k.totals.errors}<div className="dim" style={{ fontSize: 11 }}>429: {k.totals.rateLimited}</div></td>
                <td className="mono">{compact(k.totals.promptTokens + k.totals.completionTokens, locale)}<div className="dim" style={{ fontSize: 11 }}>quota: {k.providerQuota ?? t("common.unavailable")}</div></td>
                <td style={{ fontSize: 12.5 }}>{k.totals.lastSuccessAt ? relativeTime(k.totals.lastSuccessAt, locale) : "—"}</td>
                <td style={{ fontSize: 12, maxWidth: 220 }} className="dim">{k.lastError ? <span title={k.lastError} className="truncate" style={{ display: "block" }}>{k.lastError}</span> : "—"}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="icon-btn" title="Test" onClick={() => test(k.fingerprint)} disabled={testing === k.fingerprint}>{testing === k.fingerprint ? <Loader2 size={14} className="spin" /> : <Play size={14} />}</button>
                  {k.status === "cooldown" && <button className="icon-btn" title="Reset cooldown" onClick={() => api.post(`/api/admin/provider-keys/${k.fingerprint}/reset`).then(reload)}><RotateCcw size={14} /></button>}
                  <label className="check" style={{ marginLeft: 6 }} title={k.enabled ? t("common.enabled") : t("common.disabled")}>
                    <input type="checkbox" checked={k.enabled} onChange={(e) => api.patch(`/api/admin/provider-keys/${k.fingerprint}`, { enabled: e.target.checked }).then(reload).catch((err) => toast(errorText(err), "error"))} />
                  </label>
                  {k.source === "dashboard" && <button className="icon-btn" title={t("common.delete")} onClick={() => setDel(k.fingerprint)}><Trash2 size={14} /></button>}
                </td>
              </tr>
            ))}
            {data && !data.keys.length && <tr><td colSpan={9} className="dim" style={{ textAlign: "center", padding: 28 }}>No provider key configured.</td></tr>}
          </tbody>
        </table>
      </div>
      <Modal open={adding} onClose={() => setAdding(false)} title="Add XKIRO API key" footer={<><button className="btn ghost" onClick={() => setAdding(false)}>{t("common.cancel")}</button><button className="btn primary" disabled={!form.label || form.key.length < 10} onClick={add}>Save & test</button></>}>
        <div className="stack">
          <label className="field"><span>Label</span><input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Friend — Alex" /></label>
          <label className="field"><span>Owner ({t("common.optional")})</span><input className="input" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} /></label>
          <label className="field"><span>API key</span><input className="input mono" type="password" autoComplete="off" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} /><small>Encrypted at rest with AES-256-GCM. It will never be displayed again.</small></label>
          <div className="alert warning" style={{ fontSize: 13 }}>Only add keys with the explicit permission of their owner. Quotas are not combined; each key keeps its own provider limits.</div>
        </div>
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={async () => { await api.del(`/api/admin/provider-keys/${del}`); setDel(null); await reload(); }} title={t("common.delete")} body="Remove this provider key?" confirmLabel={t("common.delete")} cancelLabel={t("common.cancel")} danger />
    </div>
  );
}

function extractSrc(text: string) {
  const m = text.match(/src=["']([^"']+)["']/i);
  return (m ? m[1]! : text).trim();
}

function extractContainer(text: string) {
  return text.match(/id=["'](container-[^"']+)["']/i)?.[1] ?? "";
}

function AdsAdmin() {
  const { t, errorText } = useI18n();
  const toast = useToast();
  const { data, reload } = useLoad<any>("/api/admin/ads");
  const [f, setF] = useState<any>(null);
  const [nativeCode, setNativeCode] = useState("");
  const [socialCode, setSocialCode] = useState("");
  useEffect(() => {
    if (data) setF({ ...data.effective });
  }, [data]);
  if (!f) return <div className="skeleton" style={{ height: 300 }} />;
  const applyNative = (code: string) => {
    setNativeCode(code);
    const src = extractSrc(code);
    const container = extractContainer(code);
    setF((x: any) => ({ ...x, nativeSrc: src.startsWith("https://") ? src : x.nativeSrc, nativeContainer: container || x.nativeContainer }));
  };
  const applySocial = (code: string) => {
    setSocialCode(code);
    const src = extractSrc(code);
    if (src.startsWith("https://")) setF((x: any) => ({ ...x, socialSrc: src }));
  };
  const save = async () => {
    try {
      await api.put("/api/admin/ads", {
        enabled: f.enabled,
        nativeSrc: f.nativeSrc || "",
        nativeContainer: f.nativeContainer || "",
        socialSrc: f.socialSrc || "",
        smartlink: f.smartlink || "",
        socialDelaySeconds: Number(f.socialDelaySeconds) || 0,
        adFreePlans: f.adFreePlans
      });
      toast(t("common.saved"));
      setNativeCode("");
      setSocialCode("");
      await reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 860 }}>
      <label className="check" style={{ fontSize: 15 }}>
        <input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Ads enabled
      </label>
      <div className="card card-pad stack">
        <span className="label">Native banner — landing page only</span>
        <textarea className="textarea mono" style={{ fontSize: 12.5, minHeight: 80 }} placeholder="Paste the full Native Banner code here to fill the fields automatically" value={nativeCode} onChange={(e) => applyNative(e.target.value)} />
        <div className="grid cols-2">
          <label className="field"><span>Script URL</span><input className="input mono" value={f.nativeSrc} onChange={(e) => setF({ ...f, nativeSrc: e.target.value })} /></label>
          <label className="field"><span>Container ID</span><input className="input mono" value={f.nativeContainer} onChange={(e) => setF({ ...f, nativeContainer: e.target.value })} /></label>
        </div>
      </div>
      <div className="card card-pad stack">
        <span className="label">Social bar — whole site (except sensitive pages)</span>
        <textarea className="textarea mono" style={{ fontSize: 12.5, minHeight: 64 }} placeholder="Paste the full Social Bar code here" value={socialCode} onChange={(e) => applySocial(e.target.value)} />
        <div className="grid cols-2">
          <label className="field"><span>Script URL</span><input className="input mono" value={f.socialSrc} onChange={(e) => setF({ ...f, socialSrc: e.target.value })} /></label>
          <label className="field"><span>Delay before showing (seconds)</span><input className="input" type="number" min={0} max={600} value={f.socialDelaySeconds} onChange={(e) => setF({ ...f, socialDelaySeconds: e.target.value })} /></label>
        </div>
        <small className="dim">Never shown on login, signup, payment, pricing, settings, API keys or admin pages, nor over the chat composer on mobile.</small>
      </div>
      <div className="card card-pad stack">
        <span className="label">Smartlink — landing page only</span>
        <input className="input mono" value={f.smartlink} onChange={(e) => setF({ ...f, smartlink: e.target.value })} placeholder="https://…" />
      </div>
      <div className="card card-pad stack">
        <span className="label">Ad-free plans</span>
        <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
          {["free", "pro", "premium", "custom"].map((p) => (
            <label key={p} className="check">
              <input type="checkbox" checked={f.adFreePlans.includes(p)} onChange={(e) => setF({ ...f, adFreePlans: e.target.checked ? [...f.adFreePlans, p] : f.adFreePlans.filter((x: string) => x !== p) })} /> {t(`plan.${p}` as TKey)}
            </label>
          ))}
        </div>
        <small className="dim">Administrators never see ads.</small>
      </div>
      <div className="row">
        <button className="btn primary" onClick={save}>{t("common.save")}</button>
        <button className="btn ghost" onClick={() => setF({ ...data.defaults })}>Reset to .env</button>
      </div>
    </div>
  );
}

function Plans() {
  const { t, errorText } = useI18n();
  const toast = useToast();
  const { data, reload } = useLoad<any>("/api/admin/plans");
  const [form, setForm] = useState<any>(null);
  useEffect(() => {
    if (data) setForm(Object.fromEntries(Object.entries(data.plans).map(([k, v]: any) => [k, { tokenLimit: v.tokenLimit, resetHours: v.resetHours, priceUsd: v.priceUsd }])));
  }, [data]);
  if (!form) return null;
  const save = async () => {
    try {
      const body = Object.fromEntries(Object.entries(form).map(([k, v]: any) => [k, { tokenLimit: Number(v.tokenLimit), resetHours: Number(v.resetHours), priceUsd: Number(v.priceUsd) }]));
      await api.put("/api/admin/plans", body);
      toast(t("common.saved"));
      await reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  return (
    <div className="stack" style={{ gap: 12, maxWidth: 820 }}>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Plan</th><th>Token allowance</th><th>Reset (hours)</th><th>Price USD / month</th></tr></thead>
          <tbody>
            {Object.keys(form).map((k) => (
              <tr key={k}>
                <td>{t(`plan.${k}` as TKey)}</td>
                {(["tokenLimit", "resetHours", "priceUsd"] as const).map((f) => (
                  <td key={f}><input className="input" type="number" step={f === "priceUsd" ? "0.01" : "1"} value={form[k][f]} onChange={(e) => setForm({ ...form, [k]: { ...form[k], [f]: e.target.value } })} disabled={f === "priceUsd" && k === "free"} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="alert info" style={{ fontSize: 13 }}>Price changes apply to new checkouts. PayPal plans use the plan IDs configured in .env; update their price in PayPal too.</div>
      <div><button className="btn primary" onClick={save}>{t("common.save")}</button></div>
    </div>
  );
}

function Promos() {
  const { t, locale, errorText } = useI18n();
  const toast = useToast();
  const { data, reload } = useLoad<any>("/api/admin/promo-codes");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<any>({ code: "", description: "", type: "percent", value: 20, plans: ["premium"], maxUses: "", expiresAt: "" });
  const [usage, setUsage] = useState<any[] | null>(null);
  const create = async () => {
    try {
      await api.post("/api/admin/promo-codes", { ...form, value: Number(form.value), maxUses: form.maxUses ? Number(form.maxUses) : null, expiresAt: form.expiresAt || null });
      setCreating(false);
      await reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div><button className="btn primary" onClick={() => setCreating(true)}><Plus size={15} /> New code</button></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Code</th><th>Discount</th><th>Plans</th><th>Uses</th><th>Expires</th><th>{t("common.status")}</th><th /></tr></thead>
          <tbody>
            {data?.codes.map((c: any) => (
              <tr key={c.id}>
                <td className="mono">{c.code}<div className="dim" style={{ fontSize: 12, fontFamily: "var(--font-sans)" }}>{c.description}</div></td>
                <td>{c.type === "percent" ? `${c.value}%` : money(c.value * 100, locale)}</td>
                <td>{c.plans.join(", ")}</td>
                <td className="mono">{c.uses}{c.maxUses ? ` / ${c.maxUses}` : ""}</td>
                <td>{c.expiresAt ? formatDate(c.expiresAt, locale, false) : "—"}</td>
                <td><label className="check"><input type="checkbox" checked={c.active} onChange={(e) => api.patch(`/api/admin/promo-codes/${c.id}`, { active: e.target.checked }).then(reload)} /> {c.active ? t("common.enabled") : t("common.disabled")}</label></td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="btn sm ghost" onClick={async () => setUsage((await api.get(`/api/admin/promo-codes/${c.id}/usage`)).usage)}>History</button>
                  <button className="icon-btn" onClick={() => api.del(`/api/admin/promo-codes/${c.id}`).then(reload)}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={creating} onClose={() => setCreating(false)} title="New promo code" footer={<><button className="btn ghost" onClick={() => setCreating(false)}>{t("common.cancel")}</button><button className="btn primary" onClick={create} disabled={form.code.length < 3}>{t("common.create")}</button></>}>
        <div className="stack">
          <div className="grid cols-2">
            <label className="field"><span>Code</span><input className="input mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></label>
            <label className="field"><span>Type</span><select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="percent">Percent</option><option value="fixed">Fixed (USD)</option></select></label>
            <label className="field"><span>Value</span><input className="input" type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></label>
            <label className="field"><span>Max uses</span><input className="input" type="number" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} placeholder="∞" /></label>
            <label className="field"><span>Expires</span><input className="input" type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></label>
            <div className="field"><span>Plans</span><div className="row" style={{ height: 40 }}>{["pro", "premium"].map((p) => <label key={p} className="check"><input type="checkbox" checked={form.plans.includes(p)} onChange={(e) => setForm({ ...form, plans: e.target.checked ? [...form.plans, p] : form.plans.filter((x: string) => x !== p) })} /> {p}</label>)}</div></div>
          </div>
          <label className="field"><span>Description</span><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        </div>
      </Modal>
      <Modal open={!!usage} onClose={() => setUsage(null)} title="Usage history" width={600}>
        <div className="table-wrap"><table className="table"><tbody>
          {usage?.map((u) => <tr key={u.id}><td>{formatDate(u.createdAt, locale)}</td><td className="mono">{u.user}</td><td>{u.plan}</td><td>{u.provider}</td><td><span className="badge">{u.status}</span></td><td className="mono">{money(u.discountCents, locale)}</td></tr>)}
          {usage && !usage.length && <tr><td className="dim" style={{ textAlign: "center", padding: 20 }}>—</td></tr>}
        </tbody></table></div>
      </Modal>
    </div>
  );
}

function SimpleTable({ url, cols, pick }: { url: string; cols: string[]; pick: (d: any) => any[][] }) {
  const { data } = useLoad<any>(url);
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {data && pick(data).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
          {data && !pick(data).length && <tr><td colSpan={cols.length} className="dim" style={{ textAlign: "center", padding: 24 }}>—</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ReferralsAdmin() {
  const { locale } = useI18n();
  const { data, reload } = useLoad<any>("/api/admin/referrals");
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Referrer</th><th>Referee</th><th>Verified</th><th>Status</th><th>Date</th><th /></tr></thead>
        <tbody>
          {data?.referrals.map((r: any) => (
            <tr key={r.id}>
              <td className="mono">{r.referrer}</td><td className="mono">{r.referee}</td><td>{r.verified ? "✓" : "—"}</td>
              <td><span className={`badge ${r.status === "qualified" ? "success" : r.status === "pending" ? "warning" : ""}`}>{r.status}</span>{r.rejectReason && <span className="dim" style={{ fontSize: 12 }}> {r.rejectReason}</span>}</td>
              <td>{formatDate(r.createdAt, locale, false)}</td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {r.status !== "qualified" && <button className="btn sm" onClick={() => api.post(`/api/admin/referrals/${r.id}/status`, { status: "qualified" }).then(reload)}>Qualify</button>}
                {r.status !== "rejected" && <button className="btn sm ghost" onClick={() => api.post(`/api/admin/referrals/${r.id}/status`, { status: "rejected", reason: "admin" }).then(reload)}>Reject</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Admin() {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<Tab>("overview");
  const tabs: Tab[] = ["overview", "users", "ai", "keys", "ads", "plans", "promos", "payments", "subscriptions", "teams", "referrals", "audit"];
  const label: Record<Tab, TKey> = { overview: "admin.overview", users: "admin.users", ai: "admin.ai", keys: "admin.keys", ads: "admin.ads", plans: "admin.plans", promos: "admin.promos", payments: "admin.payments", subscriptions: "admin.subscriptions", teams: "admin.teams", referrals: "admin.referrals", audit: "admin.audit" };
  return (
    <div className="content">
      <div className="page" style={{ maxWidth: 1240 }}>
        <div className="page-head"><div><h1>{t("admin.title")}</h1></div></div>
        <div className="tabs" style={{ marginBottom: 20 }}>
          {tabs.map((k) => <button key={k} className={`tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{t(label[k])}</button>)}
        </div>
        {tab === "overview" && <Overview />}
        {tab === "users" && <Users />}
        {tab === "ai" && <AiConfig />}
        {tab === "keys" && <Keys />}
        {tab === "ads" && <AdsAdmin />}
        {tab === "plans" && <Plans />}
        {tab === "promos" && <Promos />}
        {tab === "payments" && <SimpleTable url="/api/admin/payments" cols={["Date", "User", "Provider", "Plan", "Amount", "Status"]} pick={(d) => d.payments.map((p: any) => [formatDate(p.createdAt, locale), p.user, p.provider, p.plan || "—", money(p.amountCents, locale), <span className={`badge ${p.status === "succeeded" ? "success" : p.status === "failed" ? "error" : ""}`}>{p.status}</span>])} />}
        {tab === "subscriptions" && <SimpleTable url="/api/admin/subscriptions" cols={["User", "Plan", "Provider", "Status", "Period end", "Cancel at end"]} pick={(d) => d.subscriptions.map((s: any) => [s.user, s.plan, s.provider, <span className={`badge ${s.status === "active" ? "success" : ""}`}>{s.status}</span>, formatDate(s.currentPeriodEnd, locale, false), s.cancelAtPeriodEnd ? "yes" : "no"])} />}
        {tab === "teams" && <SimpleTable url="/api/admin/teams" cols={["Team", "Owner", "Owner plan", "Members", "Created"]} pick={(d) => d.teams.map((x: any) => [x.name, x.owner, x.ownerPlan, x.members, formatDate(x.createdAt, locale, false)])} />}
        {tab === "referrals" && <ReferralsAdmin />}
        {tab === "audit" && <SimpleTable url="/api/admin/audit-logs" cols={["Date", "Actor", "Action", "Target", "Meta"]} pick={(d) => d.logs.map((l: any) => [formatDate(l.createdAt, locale), l.actor, <span className="mono">{l.action}</span>, l.targetType ? `${l.targetType}:${String(l.targetId).slice(-8)}` : "—", <span className="mono dim" style={{ fontSize: 11.5 }}>{JSON.stringify(l.meta).slice(0, 80)}</span>])} />}
      </div>
    </div>
  );
}
