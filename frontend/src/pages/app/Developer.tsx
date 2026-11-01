import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, KeyRound, Plus, RefreshCw, Trash2, Lock, BookOpen } from "lucide-react";
import { api, formatDate, formatNumber } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { Confirm, Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { Bars } from "../../components/Bars";

export function Developer() {
  const { t, locale, errorText } = useI18n();
  const toast = useToast();
  const [keys, setKeys] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<string | null>(null);
  const [tab, setTab] = useState<"recent" | "errors">("recent");
  const load = async () => {
    const [k, u] = await Promise.all([api.get("/api/developer/keys"), api.get("/api/developer/usage")]);
    setKeys(k);
    setUsage(u);
  };
  useEffect(() => {
    void load().catch((e) => toast(errorText(e), "error"));
  }, []);
  const create = async () => {
    try {
      const r = await api.post("/api/developer/keys", { name });
      setSecret(r.secret);
      setCreating(false);
      setName("");
      await load();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  const regenerate = async (id: string) => {
    try {
      const r = await api.post(`/api/developer/keys/${id}/regenerate`);
      setSecret(r.secret);
      await load();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  const copy = async (s: string) => {
    await navigator.clipboard.writeText(s);
    toast(t("common.copied"));
  };
  const rows = tab === "recent" ? usage?.recent : usage?.errors;
  return (
    <div className="content">
      <div className="page">
        <div className="page-head">
          <div>
            <h1>{t("dev.title")}</h1>
            <p>{t("dev.sub")}</p>
          </div>
          <div className="row">
            <Link to="/docs" className="btn"><BookOpen size={15} /> {t("dev.docs")}</Link>
            {keys?.apiAccess && <button className="btn primary" onClick={() => setCreating(true)}><Plus size={15} /> {t("dev.create")}</button>}
          </div>
        </div>
        {keys && !keys.apiAccess && (
          <div className="card card-pad row" style={{ justifyContent: "space-between", flexWrap: "wrap", marginBottom: 16 }}>
            <span className="row"><Lock size={16} color="var(--text-tertiary)" /> {t("dev.locked")}</span>
            <Link to="/app/pricing" className="btn primary sm">{t("nav.upgrade")}</Link>
          </div>
        )}
        <div className="grid cols-4" style={{ marginBottom: 16 }}>
          <div className="card stat"><span className="label">{t("dev.requests")}</span><div className="v">{usage ? formatNumber(usage.totals.requests, locale) : "—"}</div><div className="s">{t("dev.usage30")}</div></div>
          <div className="card stat"><span className="label">{t("common.tokens")}</span><div className="v">{usage ? formatNumber(usage.totals.tokens, locale) : "—"}</div><div className="s">{t("dev.usage30")}</div></div>
          <div className="card stat"><span className="label">{t("dev.latency")}</span><div className="v">{usage ? `${usage.totals.avgLatencyMs} ms` : "—"}</div><div className="s">{t("dev.usage30")}</div></div>
          <div className="card stat"><span className="label">Rate limit</span><div className="v" style={{ fontSize: 18 }}>{keys ? t("dev.rate", { n: keys.rateLimitPerMinute }) : "—"}</div><div className="s">{usage ? `${usage.totals.errors} errors` : ""}</div></div>
        </div>
        <div className="card card-pad" style={{ marginBottom: 24 }}>
          <span className="section-title">{t("dev.usage30")}</span>
          {usage && <Bars data={usage.daily.map((d: any) => ({ day: d.day, value: d.requests }))} locale={locale} />}
        </div>
        <h2 className="section-title">{t("dev.keys")}</h2>
        {keys?.keys.length ? (
          <div className="table-wrap" style={{ marginBottom: 24 }}>
            <table className="table">
              <thead><tr><th>{t("common.name")}</th><th>Key</th><th>{t("common.status")}</th><th>{t("dev.lastUsed")}</th><th>{t("dev.requests")}</th><th /></tr></thead>
              <tbody>
                {keys.keys.map((k: any) => (
                  <tr key={k.id} style={{ opacity: k.revoked ? 0.55 : 1 }}>
                    <td>{k.name}</td>
                    <td className="mono">{k.preview}</td>
                    <td><span className={`badge ${k.revoked ? "" : "success"}`}>{k.revoked ? t("dev.revoked") : t("dev.active")}</span></td>
                    <td>{k.lastUsedAt ? formatDate(k.lastUsedAt, locale) : t("dev.never")}</td>
                    <td className="mono">{formatNumber(k.requestCount, locale)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {!k.revoked && keys.apiAccess && <button className="btn sm ghost" onClick={() => regenerate(k.id)} title={t("dev.regenerate")}><RefreshCw size={13} /></button>}
                      {!k.revoked && <button className="btn sm danger" onClick={() => setRevoke(k.id)}><Trash2 size={13} /> {t("dev.revoke")}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card empty" style={{ marginBottom: 24 }}>
            <KeyRound size={24} color="var(--text-tertiary)" />
            <p style={{ marginTop: 10 }}>{keys?.apiAccess ? t("dev.create") : t("dev.locked")}</p>
          </div>
        )}
        <div className="tabs" style={{ marginBottom: 12 }}>
          <button className={`tab ${tab === "recent" ? "active" : ""}`} onClick={() => setTab("recent")}>{t("dev.recent")}</button>
          <button className={`tab ${tab === "errors" ? "active" : ""}`} onClick={() => setTab("errors")}>{t("dev.errors")}</button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t("common.date")}</th><th>Endpoint</th><th>{t("common.status")}</th><th>{t("common.tokens")}</th><th>Latency</th></tr></thead>
            <tbody>
              {rows?.length ? rows.map((r: any) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDate(r.createdAt, locale)}</td>
                  <td className="mono">{r.method} {r.endpoint}</td>
                  <td><span className={`badge ${r.status < 400 ? "success" : "error"}`}>{r.status}{r.errorCode ? ` · ${r.errorCode}` : ""}</span></td>
                  <td className="mono">{formatNumber(r.tokens, locale)}</td>
                  <td className="mono">{r.latencyMs} ms</td>
                </tr>
              )) : <tr><td colSpan={5} className="dim" style={{ textAlign: "center", padding: 24 }}>—</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <Modal open={creating} onClose={() => setCreating(false)} title={t("dev.create")} width={440} footer={<><button className="btn ghost" onClick={() => setCreating(false)}>{t("common.cancel")}</button><button className="btn primary" onClick={create} disabled={!name.trim()}>{t("common.create")}</button></>}>
        <label className="field"><span>{t("dev.keyName")}</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="production-server" autoFocus maxLength={60} onKeyDown={(e) => e.key === "Enter" && name.trim() && create()} /></label>
      </Modal>
      <Modal open={!!secret} onClose={() => setSecret(null)} title={t("dev.keys")} width={560} footer={<button className="btn primary" onClick={() => setSecret(null)}>{t("common.close")}</button>}>
        <div className="stack">
          <div className="alert warning">{t("dev.secretOnce")}</div>
          <div className="secret-box"><span className="grow">{secret}</span><button className="btn sm" onClick={() => copy(secret!)}><Copy size={13} /> {t("common.copy")}</button></div>
        </div>
      </Modal>
      <Confirm open={!!revoke} onClose={() => setRevoke(null)} onConfirm={async () => { try { await api.del(`/api/developer/keys/${revoke}`); setRevoke(null); await load(); } catch (e) { toast(errorText(e), "error"); } }} title={t("dev.revoke")} body={t("dev.revokeConfirm")} confirmLabel={t("dev.revoke")} cancelLabel={t("common.cancel")} danger />
    </div>
  );
}
