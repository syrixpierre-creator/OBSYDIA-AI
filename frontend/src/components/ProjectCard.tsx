import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Boxes, Download, Eye, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useToast } from "./Toast";

export interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  version?: number;
  currentVersion?: number;
  fileCount: number;
  previewable: boolean;
  progress?: { stage: string; percent: number; message: string };
  running?: boolean;
  lastError?: string | null;
}

export async function downloadVersion(projectId: string, version: number) {
  const r = await api.post<{ url: string }>(`/api/projects/${projectId}/versions/${version}/link`);
  const a = document.createElement("a");
  a.href = r.url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function ProjectCard({ initial, onUpdate }: { initial: ProjectSummary; onUpdate?: (p: ProjectSummary) => void }) {
  const { t, errorText } = useI18n();
  const toast = useToast();
  const [p, setP] = useState<ProjectSummary>(initial);
  const busy = p.status === "planning" || p.status === "generating" || p.running;
  useEffect(() => setP((prev) => ({ ...prev, ...initial })), [initial]);
  useEffect(() => {
    if (!busy) return;
    const h = setInterval(async () => {
      try {
        const r = await api.get(`/api/projects/${p.id}`);
        const next = { ...r.project, version: r.project.currentVersion };
        setP(next);
        if (!(next.status === "planning" || next.status === "generating" || next.running)) onUpdate?.(next);
      } catch {}
    }, 1500);
    return () => clearInterval(h);
  }, [busy, p.id, onUpdate]);
  const version = p.version ?? p.currentVersion ?? 0;
  return (
    <div className="project-card">
      <div className="project-card-head">
        <div className="project-card-icon">
          <Boxes size={18} />
        </div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="truncate" style={{ fontWeight: 600 }}>{p.name}</div>
          <div className="dim" style={{ fontSize: 12.5 }}>
            {t("project.card")} · {t("project.files", { n: p.fileCount })}
            {version > 0 && <> · {t("project.version", { n: version })}</>}
          </div>
        </div>
        {busy ? (
          <span className="badge primary">
            <Loader2 size={12} className="spin" /> {p.status === "planning" ? t("project.planning") : t("project.generating")}
          </span>
        ) : p.status === "error" ? (
          <span className="badge error"><AlertTriangle size={12} /> {t("project.error")}</span>
        ) : (
          <span className="badge success"><CheckCircle2 size={12} /> {t("project.ready")}</span>
        )}
      </div>
      {(busy || p.lastError) && (
        <div className="project-card-body">
          {busy && (
            <>
              <div className="progress">
                <i style={{ width: `${p.progress?.percent ?? 2}%` }} />
              </div>
              <div className="stage">
                <span className="mono dim">{String(p.progress?.percent ?? 0).padStart(2, "0")}%</span> {p.progress?.message}
              </div>
            </>
          )}
          {!busy && p.lastError && <div className="alert error" style={{ fontSize: 13 }}>{p.lastError}</div>}
        </div>
      )}
      <div className="project-card-foot">
        <Link to={`/app/projects/${p.id}`} className="btn sm">
          {t("project.open")}
        </Link>
        {!busy && p.previewable && (
          <Link to={`/app/projects/${p.id}?view=preview`} className="btn sm ghost">
            <Eye size={14} /> {t("project.preview")}
          </Link>
        )}
        {!busy && version > 0 && (
          <button
            className="btn sm ghost"
            onClick={() => downloadVersion(p.id, version).catch((e) => toast(errorText(e), "error"))}
          >
            <Download size={14} /> {t("project.download")}
          </button>
        )}
      </div>
    </div>
  );
}
