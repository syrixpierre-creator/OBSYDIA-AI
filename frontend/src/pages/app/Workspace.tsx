import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import CodeMirror from "@uiw/react-codemirror";
import { tokyoNight } from "@uiw/codemirror-theme-tokyo-night";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import {
  ArrowLeft, ChevronDown, ChevronRight, File, FilePlus, Folder, FolderOpen, Monitor, Tablet, Smartphone, RefreshCw, Maximize2, ExternalLink,
  Download, History, Save, Trash2, Loader2, Sparkles, X, AlertTriangle, CheckCircle2, Eye, Code2, Share2, Square, Pencil, MoreHorizontal, Files
} from "lucide-react";
import { api, formatBytes, formatDate } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useToast } from "../../components/Toast";
import { Confirm, Modal } from "../../components/Modal";
import { downloadVersion } from "../../components/ProjectCard";

interface FileInfo { path: string; size: number; binary: boolean; }
interface TreeNode { name: string; path: string; children?: TreeNode[]; file?: FileInfo; }

function buildTree(files: FileInfo[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", children: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const p = parts.slice(0, i + 1).join("/");
      if (i === parts.length - 1) node.children!.push({ name: part, path: p, file: f });
      else {
        let next = node.children!.find((c) => c.children && c.name === part);
        if (!next) {
          next = { name: part, path: p, children: [] };
          node.children!.push(next);
        }
        node = next;
      }
    });
  }
  const sort = (n: TreeNode[]) => {
    n.sort((a, b) => (a.children && !b.children ? -1 : !a.children && b.children ? 1 : a.name.localeCompare(b.name)));
    n.forEach((c) => c.children && sort(c.children));
  };
  sort(root.children!);
  return root.children!;
}

function langFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  if (["js", "mjs", "cjs", "jsx"].includes(ext)) return [javascript({ jsx: true })];
  if (["ts", "tsx"].includes(ext)) return [javascript({ jsx: true, typescript: true })];
  if (["html", "htm", "vue", "svelte"].includes(ext)) return [html()];
  if (["css", "scss", "less"].includes(ext)) return [css()];
  if (ext === "json") return [json()];
  if (ext === "md") return [markdown()];
  if (ext === "py") return [python()];
  return [];
}

function Tree({ nodes, depth, open, toggle, active, onSelect }: { nodes: TreeNode[]; depth: number; open: Set<string>; toggle: (p: string) => void; active: string | null; onSelect: (p: string) => void }) {
  return (
    <>
      {nodes.map((n) =>
        n.children ? (
          <div key={n.path}>
            <div className="tree-row" style={{ paddingLeft: 8 + depth * 14 }} onClick={() => toggle(n.path)}>
              {open.has(n.path) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              {open.has(n.path) ? <FolderOpen size={14} /> : <Folder size={14} />}
              <span className="truncate">{n.name}</span>
            </div>
            {open.has(n.path) && <Tree nodes={n.children} depth={depth + 1} open={open} toggle={toggle} active={active} onSelect={onSelect} />}
          </div>
        ) : (
          <div key={n.path} className={`tree-row ${active === n.path ? "active" : ""}`} style={{ paddingLeft: 22 + depth * 14 }} onClick={() => onSelect(n.path)}>
            <File size={13} />
            <span className="truncate">{n.name}</span>
          </div>
        )
      )}
    </>
  );
}

type Device = "desktop" | "tablet" | "mobile";
const DEVICE: Record<Device, { w: string; h: string }> = { desktop: { w: "100%", h: "100%" }, tablet: { w: "820px", h: "1100px" }, mobile: { w: "390px", h: "780px" } };

export function Workspace() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { t, locale, errorText } = useI18n();
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [active, setActive] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [original, setOriginal] = useState<string>("");
  const [binary, setBinary] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [device, setDevice] = useState<Device>("desktop");
  const [instruction, setInstruction] = useState("");
  const [showVersions, setShowVersions] = useState(false);
  const [newFile, setNewFile] = useState<string | null>(null);
  const [renameFile, setRenameFile] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<"file" | "project" | null>(null);
  const [restore, setRestore] = useState<number | null>(null);
  const [mobileView, setMobileView] = useState<"code" | "files" | "preview">(params.get("view") === "preview" ? "preview" : "code");
  const [menu, setMenu] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const project = data?.project;
  const busy = project && (project.status === "planning" || project.status === "generating" || project.running);
  const canWrite = project && project.role !== "viewer";

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/api/projects/${id}`);
      setData(r);
      return r;
    } catch (e) {
      toast(errorText(e), "error");
      navigate("/app/projects");
      return null;
    }
  }, [id, navigate, toast, errorText]);

  const openFile = useCallback(async (path: string) => {
    if (content !== original && active && !window.confirm(t("project.unsaved"))) return;
    try {
      const r = await api.get(`/api/projects/${id}/file?path=${encodeURIComponent(path)}`);
      setActive(path);
      setBinary(r.binary);
      setContent(r.content ?? "");
      setOriginal(r.content ?? "");
      if (window.matchMedia("(max-width: 760px)").matches) setMobileView("code");
    } catch (e) {
      toast(errorText(e), "error");
    }
  }, [id, content, original, active, t, toast, errorText]);

  const refreshPreview = useCallback(async () => {
    try {
      setPreviewLoading(true);
      const r = await api.post(`/api/projects/${id}/preview-link`);
      setPreviewUrl(r.url);
      setPreviewKey((k) => k + 1);
    } catch {
      setPreviewUrl(null);
      setPreviewLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void (async () => {
      const r = await load();
      if (!r) return;
      const first = r.files.find((f: FileInfo) => f.path === r.project.entry) || r.files.find((f: FileInfo) => /readme\.md$/i.test(f.path)) || r.files[0];
      setOpen(new Set(r.files.map((f: FileInfo) => f.path.split("/").slice(0, -1)).filter((p: string[]) => p.length === 1).map((p: string[]) => p[0])));
      if (first) void openFile(first.path);
      if (r.project.previewable) void refreshPreview();
    })();
  }, [id]);

  useEffect(() => {
    if (!busy) return;
    const h = setInterval(async () => {
      const r = await load();
      if (r && !(r.project.status === "planning" || r.project.status === "generating" || r.project.running)) {
        if (r.project.previewable) void refreshPreview();
        if (active) {
          const f = await api.get(`/api/projects/${id}/file?path=${encodeURIComponent(active)}`).catch(() => null);
          if (f) {
            setContent(f.content ?? "");
            setOriginal(f.content ?? "");
          }
        } else if (r.files[0]) void openFile(r.files[0].path);
      }
    }, 1500);
    return () => clearInterval(h);
  }, [busy, load, refreshPreview, active, id, openFile]);

  const tree = useMemo(() => buildTree(data?.files || []), [data?.files]);
  const dirty = content !== original;

  const save = async () => {
    if (!active) return;
    try {
      await api.put(`/api/projects/${id}/file`, { path: active, content });
      setOriginal(content);
      toast(t("common.saved"));
      await load();
      if (project?.previewable || /\.html?$/.test(active)) void refreshPreview();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (dirty && canWrite) void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const createFile = async () => {
    if (!newFile?.trim()) return;
    try {
      const r = await api.put(`/api/projects/${id}/file`, { path: newFile.trim(), content: "" });
      setNewFile(null);
      await load();
      setActive(r.path);
      setContent("");
      setOriginal("");
      setBinary(false);
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  const doRename = async () => {
    if (!active || !renameFile?.trim()) return;
    try {
      await api.post(`/api/projects/${id}/file/rename`, { from: active, to: renameFile.trim() });
      setActive(renameFile.trim());
      setRenameFile(null);
      await load();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  const deleteFile = async () => {
    if (!active) return;
    try {
      await api.del(`/api/projects/${id}/file?path=${encodeURIComponent(active)}`);
      setActive(null);
      setContent("");
      setOriginal("");
      setConfirmDel(null);
      await load();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  const applyInstruction = async () => {
    if (!instruction.trim()) return;
    try {
      await api.post(`/api/projects/${id}/edit`, { instruction: instruction.trim() });
      setInstruction("");
      await load();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  const doRestore = async () => {
    if (restore === null) return;
    try {
      await api.post(`/api/projects/${id}/versions/${restore}/restore`);
      setRestore(null);
      setShowVersions(false);
      const r = await load();
      if (active && r) {
        const exists = r.files.some((f: FileInfo) => f.path === active);
        if (exists) {
          const f = await api.get(`/api/projects/${id}/file?path=${encodeURIComponent(active)}`);
          setContent(f.content ?? "");
          setOriginal(f.content ?? "");
        } else setActive(null);
      }
      void refreshPreview();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  if (!data) return <div className="center-screen"><Loader2 className="spin" color="var(--text-tertiary)" /></div>;

  const latest = data.versions[0]?.version;
  const showPreviewPane = project.previewable;
  const wsClass = `ws ${showPreviewPane ? "" : "no-preview"} ${mobileView === "preview" ? "show-preview" : ""} ${mobileView === "files" ? "show-files" : ""}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="topbar bordered has-toggle">
        <Link to="/app/projects" className="icon-btn" aria-label={t("common.back")}><ArrowLeft size={17} /></Link>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="topbar-title truncate">{project.name}</div>
        </div>
        {busy ? (
          <span className="badge primary"><Loader2 size={12} className="spin" /> {project.progress?.percent}% · <span className="truncate" style={{ maxWidth: 220 }}>{project.progress?.message}</span></span>
        ) : project.validation?.ok === false ? (
          <span className="badge warning" title={project.validation.issues.join("\n")}><AlertTriangle size={12} /> {project.validation.issues.length}</span>
        ) : project.validation?.ok ? (
          <span className="badge success hide-xs" title={t("project.validationOk")}><CheckCircle2 size={12} /> {t("project.validation")}</span>
        ) : null}
        {project.role !== "owner" && <span className="badge accent">{project.role === "viewer" ? t("project.readOnly") : t("project.sharedBy")}</span>}
        {busy && canWrite && <button className="btn sm ghost" onClick={() => api.post(`/api/projects/${id}/cancel`).then(load)}><Square size={12} /> {t("project.cancel")}</button>}
        {showPreviewPane && <button className="btn sm show-md-only" onClick={() => setMobileView(mobileView === "preview" ? "code" : "preview")}><Eye size={14} /> {t("project.preview")}</button>}
        <button className="btn sm hide-xs" onClick={() => setShowVersions(true)}><History size={14} /> {t("project.versions")}</button>
        {latest && (
          <button className="btn sm primary" onClick={() => downloadVersion(id!, latest).catch((e) => toast(errorText(e), "error"))}>
            <Download size={14} /> <span className="hide-xs">{t("project.download")}</span>
          </button>
        )}
        {project.role === "owner" && (
          <div style={{ position: "relative" }}>
            <button className="icon-btn" onClick={() => setMenu((m) => !m)} aria-label={t("common.actions")}><MoreHorizontal size={17} /></button>
            {menu && (
              <div className="menu" style={{ right: 0, top: 36 }} onMouseLeave={() => setMenu(false)}>
                <button onClick={() => { setMenu(false); setShowVersions(true); }}><History size={14} /> {t("project.versions")}</button>
                <button onClick={async () => { setMenu(false); try { await api.patch(`/api/projects/${id}`, { shareWithTeam: !project.teamId }); await load(); } catch (e) { toast(errorText(e), "error"); } }}>
                  <Share2 size={14} /> {project.teamId ? t("project.unshare") : t("project.share")}
                </button>
                <button onClick={async () => { setMenu(false); try { await api.post(`/api/projects/${id}/artifact`); await load(); toast(t("common.saved")); } catch (e) { toast(errorText(e), "error"); } }}>
                  <Files size={14} /> {t("project.rebuild")}
                </button>
                <button className="danger" onClick={() => { setMenu(false); setConfirmDel("project"); }}><Trash2 size={14} /> {t("project.deleteProject")}</button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="ws-tabs-mobile" style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>
        <div className="seg" style={{ width: "100%" }}>
          <button className={mobileView === "files" ? "active" : ""} style={{ flex: 1, justifyContent: "center" }} onClick={() => setMobileView("files")}><Files size={14} /> {t("project.explorer")}</button>
          <button className={mobileView === "code" ? "active" : ""} style={{ flex: 1, justifyContent: "center" }} onClick={() => setMobileView("code")}><Code2 size={14} /> {t("project.code")}</button>
          {showPreviewPane && <button className={mobileView === "preview" ? "active" : ""} style={{ flex: 1, justifyContent: "center" }} onClick={() => setMobileView("preview")}><Eye size={14} /> {t("project.preview")}</button>}
        </div>
      </div>
      <div className={wsClass} style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <div className="ws-pane ws-files">
          <div className="ws-head">
            <span className="label">{t("project.explorer")}</span>
            {canWrite && <button className="icon-btn" title={t("project.newFile")} aria-label={t("project.newFile")} onClick={() => setNewFile("")}><FilePlus size={15} /></button>}
          </div>
          <div className="tree">
            {busy && !data.files.length && [1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 16, margin: "10px 8px" }} />)}
            <Tree nodes={tree} depth={0} open={open} toggle={(p) => setOpen((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; })} active={active} onSelect={openFile} />
          </div>
          <div className="dim mono" style={{ fontSize: 11, padding: "8px 14px", borderTop: "1px solid var(--border)" }}>
            {t("project.files", { n: project.fileCount })} · {formatBytes(project.totalBytes)}
          </div>
        </div>
        <div className="ws-pane">
          <div className="ws-head" style={{ paddingLeft: 12 }}>
            <span className="mono truncate grow" style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{active || "—"}{dirty && " •"}</span>
            {active && canWrite && (
              <>
                <button className="icon-btn" title={t("project.renameFile")} aria-label={t("project.renameFile")} onClick={() => setRenameFile(active)}><Pencil size={14} /></button>
                <button className="icon-btn" title={t("project.deleteFile")} aria-label={t("project.deleteFile")} onClick={() => setConfirmDel("file")}><Trash2 size={14} /></button>
                <button className="btn sm primary" onClick={save} disabled={!dirty}><Save size={13} /> {t("common.save")}</button>
              </>
            )}
          </div>
          <div className="editor-wrap">
            {!active ? (
              <div className="empty"><Code2 size={24} color="var(--text-tertiary)" /><p style={{ marginTop: 10 }}>{t("project.selectFile")}</p></div>
            ) : binary ? (
              <div className="empty"><p>{t("project.binary")}</p></div>
            ) : (
              <CodeMirror value={content} height="100%" theme={tokyoNight} extensions={langFor(active)} editable={!!canWrite && !busy} onChange={setContent} basicSetup={{ foldGutter: true, highlightActiveLine: true }} />
            )}
          </div>
          {canWrite && (
            <div className="ws-bottom">
              <textarea className="textarea" rows={1} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder={t("project.instruction")} disabled={busy} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void applyInstruction(); }} />
              <button className="btn primary" onClick={applyInstruction} disabled={busy || instruction.trim().length < 3 || !project.fileCount}>
                {busy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />} <span className="hide-xs">{t("project.apply")}</span>
              </button>
            </div>
          )}
        </div>
        {showPreviewPane && (
          <div className="ws-pane ws-preview">
            <div className="ws-head" style={{ paddingLeft: 8 }}>
              <div className="seg">
                <button className={device === "desktop" ? "active" : ""} onClick={() => setDevice("desktop")} title={t("project.desktop")} aria-label={t("project.desktop")}><Monitor size={14} /></button>
                <button className={device === "tablet" ? "active" : ""} onClick={() => setDevice("tablet")} title={t("project.tablet")} aria-label={t("project.tablet")}><Tablet size={14} /></button>
                <button className={device === "mobile" ? "active" : ""} onClick={() => setDevice("mobile")} title={t("project.mobile")} aria-label={t("project.mobile")}><Smartphone size={14} /></button>
              </div>
              <span className="grow" />
              {previewLoading && <Loader2 size={14} className="spin" color="var(--text-tertiary)" />}
              <button className="icon-btn" onClick={refreshPreview} title={t("common.refresh")} aria-label={t("common.refresh")}><RefreshCw size={14} /></button>
              <button className="icon-btn" onClick={() => stageRef.current?.requestFullscreen?.()} title={t("project.fullscreen")} aria-label={t("project.fullscreen")}><Maximize2 size={14} /></button>
              {previewUrl && <a className="icon-btn" href={previewUrl} target="_blank" rel="noopener noreferrer" title={t("project.openTab")} aria-label={t("project.openTab")}><ExternalLink size={14} /></a>}
              <button className="icon-btn ws-close-mobile" onClick={() => setMobileView("code")} aria-label={t("common.close")}><X size={14} /></button>
            </div>
            <div ref={stageRef} className={`preview-stage ${device !== "desktop" ? "device" : ""}`}>
              {previewUrl ? (
                <iframe
                  key={previewKey}
                  ref={frameRef}
                  className="preview-frame"
                  src={previewUrl}
                  title="Preview"
                  sandbox="allow-scripts allow-forms allow-modals allow-popups"
                  referrerPolicy="no-referrer"
                  style={{ width: DEVICE[device].w, height: DEVICE[device].h, maxWidth: "100%" }}
                  onLoad={() => setPreviewLoading(false)}
                  onError={() => setPreviewLoading(false)}
                />
              ) : busy ? (
                <div className="empty"><Loader2 className="spin" size={22} /></div>
              ) : (
                <div className="empty"><p>{t("project.previewError")}</p></div>
              )}
            </div>
          </div>
        )}
      </div>
      {!showPreviewPane && !busy && project.fileCount > 0 && (
        <div className="alert info" style={{ margin: 12 }}>{t("project.notPreviewable")}</div>
      )}
      {project.lastError && !busy && <div className="alert error" style={{ margin: "0 12px 12px" }}>{project.lastError}</div>}

      <Modal open={showVersions} onClose={() => setShowVersions(false)} title={t("project.versions")} width={640}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>#</th><th>{t("common.date")}</th><th>{t("project.files", { n: "" }).trim()}</th><th>Size</th><th /></tr></thead>
            <tbody>
              {data.versions.map((v: any) => (
                <tr key={v.version}>
                  <td className="mono">v{v.version}</td>
                  <td>
                    <div>{formatDate(v.createdAt, locale)}</div>
                    {v.note && <div className="dim truncate" style={{ fontSize: 12, maxWidth: 220 }}>{v.note}</div>}
                  </td>
                  <td>{v.fileCount}</td>
                  <td>{formatBytes(v.sizeBytes)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="btn sm ghost" onClick={() => downloadVersion(id!, v.version).catch((e) => toast(errorText(e), "error"))}><Download size={13} /></button>
                    {canWrite && v.version !== latest && <button className="btn sm" onClick={() => setRestore(v.version)}>{t("project.restore")}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
      <Modal open={newFile !== null} onClose={() => setNewFile(null)} title={t("project.newFile")} width={440} footer={<><button className="btn ghost" onClick={() => setNewFile(null)}>{t("common.cancel")}</button><button className="btn primary" onClick={createFile} disabled={!newFile?.trim()}>{t("common.create")}</button></>}>
        <input className="input mono" value={newFile || ""} onChange={(e) => setNewFile(e.target.value)} placeholder={t("project.newFilePath")} autoFocus onKeyDown={(e) => e.key === "Enter" && createFile()} />
      </Modal>
      <Modal open={renameFile !== null} onClose={() => setRenameFile(null)} title={t("project.renameFile")} width={440} footer={<><button className="btn ghost" onClick={() => setRenameFile(null)}>{t("common.cancel")}</button><button className="btn primary" onClick={doRename}>{t("common.save")}</button></>}>
        <input className="input mono" value={renameFile || ""} onChange={(e) => setRenameFile(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && doRename()} />
      </Modal>
      <Confirm open={confirmDel === "file"} onClose={() => setConfirmDel(null)} onConfirm={deleteFile} title={t("project.deleteFile")} body={active || ""} confirmLabel={t("common.delete")} cancelLabel={t("common.cancel")} danger />
      <Confirm
        open={confirmDel === "project"}
        onClose={() => setConfirmDel(null)}
        onConfirm={async () => { try { await api.del(`/api/projects/${id}`); navigate("/app/projects"); } catch (e) { toast(errorText(e), "error"); } }}
        title={t("project.deleteProject")}
        body={t("project.deleteConfirm")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        danger
      />
      <Confirm open={restore !== null} onClose={() => setRestore(null)} onConfirm={doRestore} title={t("project.restore")} body={t("project.restoreConfirm", { n: restore ?? "" })} confirmLabel={t("project.restore")} cancelLabel={t("common.cancel")} />
    </div>
  );
}
