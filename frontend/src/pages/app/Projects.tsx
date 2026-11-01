import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Boxes, Plus, Sparkles, Loader2, Users, FileArchive } from "lucide-react";
import { api, formatBytes, relativeTime } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";

export function Projects() {
  const { t, locale, errorText } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const [projects, setProjects] = useState<any[] | null>(null);
  const [mode, setMode] = useState<"ai" | "blank" | null>(null);
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/api/projects").then((r) => setProjects(r.projects)).catch((e) => toast(errorText(e), "error"));
  useEffect(() => {
    void load();
    const h = setInterval(() => void load(), 4000);
    return () => clearInterval(h);
  }, []);
  const create = async () => {
    setBusy(true);
    try {
      if (mode === "ai") {
        const r = await api.post("/api/projects/generate", { prompt });
        navigate(`/app/projects/${r.project.id}`);
      } else {
        const r = await api.post("/api/projects", { name });
        navigate(`/app/projects/${r.project.id}`);
      }
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="content">
      <div className="page">
        <div className="page-head">
          <div>
            <h1>{t("project.newTitle")}</h1>
            <p>{t("project.newSub")}</p>
          </div>
          <div className="row">
            <button className="btn" onClick={() => setMode("blank")}><Plus size={15} /> {t("project.blank")}</button>
            <button className="btn primary" onClick={() => setMode("ai")}><Sparkles size={15} /> {t("project.generate")}</button>
          </div>
        </div>
        {!projects ? (
          <div className="grid cols-3">{[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 150 }} />)}</div>
        ) : projects.length === 0 ? (
          <div className="card empty">
            <Boxes size={28} color="var(--text-tertiary)" />
            <h3>{t("project.empty")}</h3>
            <p>{t("project.emptyBody")}</p>
            <button className="btn primary" style={{ marginTop: 18 }} onClick={() => setMode("ai")}><Sparkles size={15} /> {t("project.generate")}</button>
          </div>
        ) : (
          <div className="grid cols-3">
            {projects.map((p) => {
              const busyP = p.status === "planning" || p.status === "generating" || p.running;
              return (
                <Link key={p.id} to={`/app/projects/${p.id}`} className="card card-pad project-tile">
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div className="project-card-icon">{p.source === "upload" ? <FileArchive size={18} /> : <Boxes size={18} />}</div>
                    {busyP ? (
                      <span className="badge primary"><Loader2 size={12} className="spin" /> {p.progress?.percent ?? 0}%</span>
                    ) : p.status === "error" ? (
                      <span className="badge error">{t("project.error")}</span>
                    ) : (
                      <span className="badge">v{p.currentVersion}</span>
                    )}
                  </div>
                  <h3 className="truncate" style={{ margin: "14px 0 4px", fontSize: 15.5, fontWeight: 600 }}>{p.name}</h3>
                  <p className="muted" style={{ margin: 0, fontSize: 13, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: 40 }}>{p.description || "—"}</p>
                  <div className="row dim" style={{ fontSize: 12, marginTop: 14, flexWrap: "wrap" }}>
                    <span>{t("project.files", { n: p.fileCount })}</span>·<span>{formatBytes(p.totalBytes)}</span>·<span>{relativeTime(p.updatedAt, locale)}</span>
                    {p.role !== "owner" && <span className="badge accent"><Users size={11} /> {t("project.sharedBy")}</span>}
                  </div>
                  {p.stack?.length > 0 && (
                    <div className="row" style={{ marginTop: 10, flexWrap: "wrap", gap: 4 }}>
                      {p.stack.slice(0, 4).map((s: string) => <span key={s} className="badge">{s}</span>)}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
      <Modal
        open={mode !== null}
        onClose={() => setMode(null)}
        title={mode === "ai" ? t("project.generate") : t("project.blank")}
        width={600}
        footer={
          <>
            <button className="btn ghost" onClick={() => setMode(null)}>{t("common.cancel")}</button>
            <button className="btn primary" onClick={create} disabled={busy || (mode === "ai" ? prompt.trim().length < 8 : !name.trim())}>
              {busy && <Loader2 size={15} className="spin" />} {t("common.create")}
            </button>
          </>
        }
      >
        {mode === "ai" ? (
          <label className="field">
            <span>{t("project.promptLabel")}</span>
            <textarea className="textarea" style={{ minHeight: 160 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t("project.promptPlaceholder")} autoFocus />
          </label>
        ) : (
          <label className="field">
            <span>{t("common.name")}</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={120} />
          </label>
        )}
      </Modal>
    </div>
  );
}
