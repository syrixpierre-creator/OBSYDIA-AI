import { useEffect, useState } from "react";
import { Copy, Gift } from "lucide-react";
import { api, formatDate, formatNumber } from "../../lib/api";
import { useI18n, type TKey } from "../../lib/i18n";
import { useToast } from "../../components/Toast";

export function Referrals() {
  const { t, locale, errorText } = useI18n();
  const toast = useToast();
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    api.get("/api/referrals").then(setD).catch((e) => toast(errorText(e), "error"));
  }, []);
  const copy = async (s: string) => {
    await navigator.clipboard.writeText(s);
    toast(t("common.copied"));
  };
  return (
    <div className="content">
      <div className="page">
        <div className="page-head">
          <div>
            <h1>{t("ref.title")}</h1>
            <p>{d ? t("ref.sub", { tokens: formatNumber(d.rewardTokens, locale), n: d.required }) : " "}</p>
          </div>
        </div>
        {d && (
          <>
            <div className="card card-pad" style={{ marginBottom: 16 }}>
              <span className="label">{t("ref.link")}</span>
              <div className="secret-box" style={{ marginTop: 10, borderStyle: "solid", borderColor: "var(--border)" }}>
                <span className="grow">{d.link}</span>
                <button className="btn sm" onClick={() => copy(d.link)}><Copy size={13} /> {t("common.copy")}</button>
              </div>
              <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
                <span className="dim">{t("ref.code")}</span><span className="mono badge">{d.code}</span>
              </div>
              <div style={{ marginTop: 20 }}>
                <div className="row" style={{ justifyContent: "space-between", fontSize: 13 }}>
                  <span className="muted">{t("ref.progress", { x: d.progress, n: d.required })}</span>
                  <span className="mono dim">+{formatNumber(d.rewardTokens, locale)}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${d.required}, 1fr)`, gap: 6, marginTop: 10 }}>
                  {Array.from({ length: d.required }).map((_, i) => (
                    <div key={i} style={{ height: 8, borderRadius: 4, background: i < d.progress ? "var(--primary)" : "var(--surface-hover)" }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="grid cols-4" style={{ marginBottom: 16 }}>
              <div className="card stat"><span className="label">{t("ref.pending")}</span><div className="v">{d.pending}</div></div>
              <div className="card stat"><span className="label">{t("ref.qualified")}</span><div className="v">{d.qualified}</div></div>
              <div className="card stat"><span className="label">{t("ref.rejected")}</span><div className="v">{d.rejected}</div></div>
              <div className="card stat"><span className="label">{t("ref.earned")}</span><div className="v">{formatNumber(d.earnedTokens, locale)}</div></div>
            </div>
            <p className="dim" style={{ fontSize: 13, margin: "0 0 20px" }}>{t("ref.rules")}</p>
            <h2 className="section-title">{t("ref.list")}</h2>
            {d.referrals.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>{t("common.name")}</th><th>{t("common.email")}</th><th>{t("common.status")}</th><th>{t("common.date")}</th></tr></thead>
                  <tbody>
                    {d.referrals.map((r: any) => (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td className="mono">{r.email}</td>
                        <td>
                          <span className={`badge ${r.status === "qualified" ? "success" : r.status === "pending" ? "warning" : ""}`}>{t(`ref.${r.status === "rejected" ? "rejected" : r.status}` as TKey)}</span>
                          {r.rejectReason && <span className="dim" style={{ fontSize: 12, marginLeft: 6 }}>{t(`ref.reason.${r.rejectReason}` as TKey)}</span>}
                        </td>
                        <td>{formatDate(r.createdAt, locale, false)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="card empty"><Gift size={24} color="var(--text-tertiary)" /><p style={{ marginTop: 10 }}>{t("landing.referralTitle")}</p></div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
