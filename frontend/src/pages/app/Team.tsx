import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, Lock, UserPlus, X, Boxes } from "lucide-react";
import { api, formatDate } from "../../lib/api";
import { useI18n, type TKey } from "../../lib/i18n";
import { useSession } from "../../lib/session";
import { Confirm } from "../../components/Modal";
import { useToast } from "../../components/Toast";

function TeamView({ team, reload }: { team: any; reload: () => void }) {
  const { t, locale, errorText } = useI18n();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [busy, setBusy] = useState(false);
  const [dissolve, setDissolve] = useState(false);
  const act = async (fn: () => Promise<any>) => {
    try {
      await fn();
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card card-pad">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>{team.name}</h2>
            <div className="dim" style={{ fontSize: 13, marginTop: 2 }}>{t("team.seats", { x: team.seatsUsed, n: team.maxInvites })}</div>
          </div>
          {!team.isOwner && <button className="btn sm danger" onClick={() => act(() => api.post(`/api/teams/${team.id}/leave`))}>{t("team.leave")}</button>}
        </div>
        <div className="progress" style={{ marginTop: 14 }}><i style={{ width: `${(team.seatsUsed / Math.max(1, team.maxInvites)) * 100}%` }} /></div>
        <p className="dim" style={{ fontSize: 13, margin: "12px 0 0" }}>{t("team.tokensNote")}</p>
      </div>
      {team.isOwner && (
        <div className="card card-pad">
          <span className="section-title">{t("team.invite")}</span>
          <form className="row" style={{ flexWrap: "wrap" }} onSubmit={async (e) => { e.preventDefault(); setBusy(true); await act(() => api.post("/api/teams/invitations", { email, role })); setEmail(""); setBusy(false); }}>
            <input className="input grow" type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ minWidth: 200 }} />
            <select className="select" style={{ width: 140 }} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="editor">{t("team.editor")}</option>
              <option value="viewer">{t("team.viewer")}</option>
            </select>
            <button className="btn primary" disabled={busy || team.seatsUsed >= team.maxInvites}><UserPlus size={15} /> {t("team.invite")}</button>
          </form>
        </div>
      )}
      <div>
        <h3 className="section-title">{t("team.members")}</h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t("common.name")}</th><th>{t("common.email")}</th><th>{t("team.role")}</th><th>{t("common.date")}</th><th /></tr></thead>
            <tbody>
              {team.members.map((m: any) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td className="mono">{m.email}</td>
                  <td>
                    {team.isOwner && m.role !== "owner" ? (
                      <select className="select" style={{ height: 30, width: 120 }} value={m.role} onChange={(e) => act(() => api.patch(`/api/teams/members/${m.id}`, { role: e.target.value }))}>
                        <option value="editor">{t("team.editor")}</option>
                        <option value="viewer">{t("team.viewer")}</option>
                      </select>
                    ) : (
                      <span className={`badge ${m.role === "owner" ? "primary" : ""}`}>{t(`team.${m.role}` as TKey)}</span>
                    )}
                  </td>
                  <td>{formatDate(m.joinedAt, locale, false)}</td>
                  <td style={{ textAlign: "right" }}>{team.isOwner && m.role !== "owner" && <button className="btn sm danger" onClick={() => act(() => api.del(`/api/teams/members/${m.id}`))}>{t("team.remove")}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {team.invitations.length > 0 && (
        <div>
          <h3 className="section-title">{t("team.invitations")}</h3>
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {team.invitations.map((i: any) => (
                  <tr key={i.id}>
                    <td className="mono">{i.email}</td>
                    <td><span className="badge">{t(`team.${i.role}` as TKey)}</span></td>
                    <td className="dim">{formatDate(i.expiresAt, locale, false)}</td>
                    <td style={{ textAlign: "right" }}><button className="icon-btn" onClick={() => act(() => api.del(`/api/teams/invitations/${i.id}`))} aria-label={t("common.delete")}><X size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div>
        <h3 className="section-title">{t("team.projects")}</h3>
        {team.projects.length ? (
          <div className="grid cols-3">
            {team.projects.map((p: any) => (
              <Link key={p.id} to={`/app/projects/${p.id}`} className="card card-pad project-tile row">
                <Boxes size={16} color="var(--text-tertiary)" />
                <span className="grow truncate">{p.name}</span>
                <span className="dim" style={{ fontSize: 12 }}>{t("project.files", { n: p.fileCount })}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card empty" style={{ padding: 24 }}>{t("project.share")} — {t("nav.projects")}</div>
        )}
      </div>
      {team.isOwner && (
        <div>
          <button className="btn sm danger" onClick={() => setDissolve(true)}>{t("team.dissolve")}</button>
          <Confirm open={dissolve} onClose={() => setDissolve(false)} onConfirm={() => act(() => api.del("/api/teams"))} title={t("team.dissolve")} body={team.name} confirmLabel={t("common.delete")} cancelLabel={t("common.cancel")} danger />
        </div>
      )}
    </div>
  );
}

export function Team() {
  const { t, errorText } = useI18n();
  const { plan, config } = useSession();
  const toast = useToast();
  const [d, setD] = useState<any>(null);
  const [name, setName] = useState("");
  const load = () => api.get("/api/teams").then(setD).catch((e) => toast(errorText(e), "error"));
  useEffect(() => {
    void load();
  }, []);
  const max = config?.plans.find((p) => p.id === "premium")?.maxTeamInvites ?? 3;
  return (
    <div className="content">
      <div className="page">
        <div className="page-head">
          <div>
            <h1>{t("team.title")}</h1>
            <p>{t("team.sub", { n: max })}</p>
          </div>
        </div>
        {d && (
          <div className="stack" style={{ gap: 24 }}>
            {d.owned ? (
              <TeamView team={d.owned} reload={load} />
            ) : plan?.teams ? (
              <div className="card card-pad">
                <span className="section-title">{t("team.create")}</span>
                <form className="row" onSubmit={async (e) => { e.preventDefault(); try { await api.post("/api/teams", { name }); await load(); } catch (err) { toast(errorText(err), "error"); } }}>
                  <input className="input grow" placeholder={t("team.name")} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
                  <button className="btn primary"><Users size={15} /> {t("team.create")}</button>
                </form>
              </div>
            ) : (
              <div className="card card-pad row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <span className="row"><Lock size={16} color="var(--text-tertiary)" /> {t("team.locked")}</span>
                <Link to="/app/pricing?plan=premium" className="btn primary sm">{t("nav.upgrade")}</Link>
              </div>
            )}
            {d.memberOf.length > 0 && (
              <div className="stack" style={{ gap: 16 }}>
                <h2 className="section-title" style={{ margin: 0 }}>{t("team.memberOf")}</h2>
                {d.memberOf.map((team: any) => <TeamView key={team.id} team={team} reload={load} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
