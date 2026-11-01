import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, Sparkles } from "lucide-react";
import { api, formatDate, formatNumber, money, relativeTime } from "../../lib/api";
import { useI18n, type TKey } from "../../lib/i18n";
import { useSession } from "../../lib/session";
import { Confirm } from "../../components/Modal";
import { Bars } from "../../components/Bars";
import { useToast } from "../../components/Toast";

export function Billing() {
  const { t, locale, errorText } = useI18n();
  const { user, balance, refreshBalance, refreshUser } = useSession();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [overview, setOverview] = useState<any>(null);
  const [history, setHistory] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [cancel, setCancel] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "info"; text: string } | null>(null);

  const load = async () => {
    const [o, h] = await Promise.all([api.get("/api/billing/overview"), api.get(`/api/tokens/history?page=${page}&limit=20`)]);
    setOverview(o);
    setHistory(h);
  };
  useEffect(() => {
    void load().catch((e) => toast(errorText(e), "error"));
  }, [page]);

  useEffect(() => {
    if (params.get("checkout") !== "success") return;
    const provider = params.get("provider") as "stripe" | "paypal";
    const reference = provider === "stripe" ? params.get("session_id") : params.get("subscription_id");
    setNotice({ kind: "info", text: t("billing.pending") });
    void (async () => {
      for (let i = 0; i < 6; i++) {
        try {
          const r = reference ? await api.post("/api/billing/confirm", { provider, reference }) : { active: false };
          if (r.active) {
            setNotice({ kind: "success", text: t("billing.activated") });
            await Promise.all([refreshUser(), refreshBalance(), load()]);
            setParams({}, { replace: true });
            return;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 2500));
      }
    })();
  }, []);

  const pct = balance ? (balance.used / Math.max(1, balance.allowance)) * 100 : 0;
  return (
    <div className="content">
      <div className="page">
        <div className="page-head">
          <div>
            <h1>{t("billing.title")}</h1>
            <p>{t("billing.howCounted")}</p>
          </div>
          {user?.plan !== "premium" && user?.plan !== "custom" && <Link to="/app/pricing" className="btn primary"><Sparkles size={15} /> {t("nav.upgrade")}</Link>}
        </div>
        {notice && <div className={`alert ${notice.kind}`} style={{ marginBottom: 16 }}>{notice.kind === "info" && <Loader2 size={16} className="spin" />} {notice.text}</div>}
        <div className="grid cols-4" style={{ marginBottom: 16 }}>
          <div className="card stat"><span className="label">{t("billing.currentPlan")}</span><div className="v">{t(`plan.${user!.plan}` as TKey)}</div><div className="s">{overview?.planDetails ? `${money(overview.planDetails.priceUsd * 100, locale)}${t("pricing.month")}` : " "}</div></div>
          <div className="card stat"><span className="label">{t("billing.remaining")}</span><div className="v">{balance ? formatNumber(balance.remaining, locale) : "—"}</div><div className="s">{t("billing.total")} {balance ? formatNumber(balance.total, locale) : "—"}</div></div>
          <div className="card stat"><span className="label">{t("billing.bonus")}</span><div className="v">{balance ? formatNumber(balance.bonus, locale) : "—"}</div><div className="s">{t("billing.tx.referral_bonus")}</div></div>
          <div className="card stat"><span className="label">{t("billing.nextReset")}</span><div className="v" style={{ fontSize: 18 }}>{balance ? relativeTime(balance.resetAt, locale) : "—"}</div><div className="s">{balance ? formatDate(balance.resetAt, locale) : ""}</div></div>
        </div>
        <div className="grid cols-2" style={{ marginBottom: 16 }}>
          <div className="card card-pad">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="section-title" style={{ margin: 0 }}>{t("billing.balance")}</span>
              <span className="mono dim" style={{ fontSize: 12 }}>{balance && `${formatNumber(balance.used, locale)} / ${formatNumber(balance.allowance, locale)}`}</span>
            </div>
            <div className="progress" style={{ margin: "16px 0 10px", height: 8 }}><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
            <dl className="kv">
              <dt>{t("billing.used")}</dt><dd>{balance ? formatNumber(balance.used, locale) : "—"}</dd>
              <dt>{t("billing.bonus")}</dt><dd>{balance ? formatNumber(balance.bonus, locale) : "—"}</dd>
              <dt>{t("billing.remaining")}</dt><dd>{balance ? formatNumber(balance.remaining, locale) : "—"}</dd>
            </dl>
          </div>
          <div className="card card-pad">
            <span className="section-title">{t("billing.usage14")}</span>
            {history && <Bars data={history.daily.map((d: any) => ({ day: d.day, value: d.tokens }))} locale={locale} />}
          </div>
        </div>

        {overview?.subscriptions?.length > 0 && (
          <>
            <h2 className="section-title" style={{ marginTop: 28 }}>{t("billing.subscriptions")}</h2>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t("settings.plan")}</th><th>Provider</th><th>{t("common.status")}</th><th>{t("common.date")}</th><th /></tr></thead>
                <tbody>
                  {overview.subscriptions.map((s: any) => (
                    <tr key={s.id}>
                      <td>{t(`plan.${s.plan}` as TKey)}</td>
                      <td style={{ textTransform: "capitalize" }}>{s.provider}</td>
                      <td><span className={`badge ${s.status === "active" ? "success" : s.status === "past_due" ? "warning" : ""}`}>{s.status}</span></td>
                      <td>{s.currentPeriodEnd ? (s.cancelAtPeriodEnd ? t("billing.ends", { date: formatDate(s.currentPeriodEnd, locale, false) }) : t("billing.renews", { date: formatDate(s.currentPeriodEnd, locale, false) })) : "—"}</td>
                      <td style={{ textAlign: "right" }}>
                        {s.status === "active" && !s.cancelAtPeriodEnd && <button className="btn sm danger" onClick={() => setCancel(s.id)}>{t("billing.cancel")}</button>}
                        {s.status === "active" && s.cancelAtPeriodEnd && s.provider === "stripe" && (
                          <button className="btn sm" onClick={async () => { try { await api.post(`/api/billing/subscriptions/${s.id}/resume`); await load(); } catch (e) { toast(errorText(e), "error"); } }}>{t("billing.resume")}</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <h2 className="section-title" style={{ marginTop: 28 }}>{t("billing.payments")}</h2>
        {overview?.payments?.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t("common.date")}</th><th>{t("settings.plan")}</th><th>Provider</th><th>Amount</th><th>{t("common.status")}</th></tr></thead>
              <tbody>
                {overview.payments.map((p: any) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.createdAt, locale)}</td>
                    <td>{p.plan ? t(`plan.${p.plan}` as TKey) : "—"}</td>
                    <td style={{ textTransform: "capitalize" }}>{p.provider}</td>
                    <td className="mono">{money(p.amountCents, locale)}{p.refundedCents > 0 && <span className="dim"> (−{money(p.refundedCents, locale)})</span>}</td>
                    <td><span className={`badge ${p.status === "succeeded" ? "success" : p.status === "failed" ? "error" : p.status.includes("refund") ? "warning" : ""}`}>{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card empty" style={{ padding: 28 }}>{t("billing.noPayments")}</div>
        )}

        <h2 className="section-title" style={{ marginTop: 28 }}>{t("billing.history")}</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t("common.date")}</th><th>Type</th><th>Detail</th><th style={{ textAlign: "right" }}>{t("common.tokens")}</th></tr></thead>
            <tbody>
              {history?.items.map((tx: any) => (
                <tr key={tx.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDate(tx.createdAt, locale)}</td>
                  <td>{t(`billing.tx.${tx.type}` as TKey)}</td>
                  <td className="dim" style={{ fontSize: 13 }}>
                    {tx.type === "usage" ? `${tx.feature} · ${tx.via} · in ${formatNumber(tx.promptTokens, locale)} / out ${formatNumber(tx.completionTokens, locale)}${tx.estimated ? ` · ${t("billing.estimated")}` : ""}` : tx.note}
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: tx.amount < 0 ? "var(--text-secondary)" : "var(--success)" }}>{tx.amount > 0 ? "+" : ""}{formatNumber(tx.amount, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {history && history.total > 20 && (
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
            <button className="btn sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>{t("common.previous")}</button>
            <button className="btn sm" disabled={page * 20 >= history.total} onClick={() => setPage((p) => p + 1)}>{t("common.next")}</button>
          </div>
        )}
      </div>
      <Confirm
        open={!!cancel}
        onClose={() => setCancel(null)}
        onConfirm={async () => { try { await api.post(`/api/billing/subscriptions/${cancel}/cancel`); setCancel(null); await load(); } catch (e) { toast(errorText(e), "error"); } }}
        title={t("billing.cancel")}
        body={t("billing.cancelConfirm")}
        confirmLabel={t("billing.cancel")}
        cancelLabel={t("common.cancel")}
        danger
      />
    </div>
  );
}
