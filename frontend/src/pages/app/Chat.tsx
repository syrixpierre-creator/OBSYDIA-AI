import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowUp, Square, Paperclip, Mic, Hammer, Copy, RefreshCw, ThumbsUp, ThumbsDown, Volume2, VolumeX, Pencil, X, FileText,
  FileArchive, Image as ImageIcon, FileCode2, Loader2, Code2, Bug, Layers, Sparkles, AlertTriangle, FolderOpen
} from "lucide-react";
import { api, ApiError, formatNumber, streamPost } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useSession } from "../../lib/session";
import { useConversations } from "../../lib/conversations";
import { useToast } from "../../components/Toast";
import { Markdown } from "../../components/Markdown";
import { ProjectCard, type ProjectSummary } from "../../components/ProjectCard";
import { Mark } from "../../components/Logo";

interface Attachment {
  fileId: string;
  kind: string;
  name: string;
  mime: string;
  size: number;
}

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments: Attachment[];
  status: "complete" | "streaming" | "stopped" | "error";
  error?: string | null;
  errorMessage?: string;
  usage?: { totalTokens: number; estimated: boolean };
  feedback?: "up" | "down" | null;
  projectId?: string | null;
  model?: string | null;
}

function AttIcon({ kind }: { kind: string }) {
  if (kind === "image") return <ImageIcon size={14} />;
  if (kind === "zip") return <FileArchive size={14} />;
  if (kind === "code") return <FileCode2 size={14} />;
  return <FileText size={14} />;
}

function AttachmentView({ a }: { a: Attachment }) {
  const { t, errorText } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  if (a.kind === "image") {
    return (
      <a className="att att-thumb" href={`/api/files/${a.fileId}/content`} target="_blank" rel="noreferrer">
        <img src={`/api/files/${a.fileId}/content`} alt={a.name} loading="lazy" />
      </a>
    );
  }
  return (
    <div className="att">
      <AttIcon kind={a.kind} />
      <span className="truncate">{a.name}</span>
      {a.kind === "zip" && (
        <button
          className="link"
          style={{ fontSize: 12, whiteSpace: "nowrap" }}
          onClick={async () => {
            try {
              const r = await api.post(`/api/files/${a.fileId}/import-project`, {});
              navigate(`/app/projects/${r.projectId}`);
            } catch (e) {
              toast(errorText(e), "error");
            }
          }}
        >
          <FolderOpen size={12} style={{ display: "inline", verticalAlign: -2 }} /> {t("chat.importZip")}
        </button>
      )}
    </div>
  );
}

function speak(text: string, locale: string, onEnd: () => void) {
  const clean = text.replace(/```[\s\S]*?```/g, " ").replace(/[#*_`>|-]/g, " ");
  const u = new SpeechSynthesisUtterance(clean.slice(0, 6000));
  u.lang = locale === "fr" ? "fr-FR" : "en-US";
  u.onend = onEnd;
  u.onerror = onEnd;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

function MessageView({
  m, last, busy, onRegenerate, onEdit, project, onProjectUpdate
}: {
  m: Msg;
  last: boolean;
  busy: boolean;
  onRegenerate: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  project?: ProjectSummary;
  onProjectUpdate: (p: ProjectSummary) => void;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.content);
  const [feedback, setFeedback] = useState(m.feedback ?? null);
  const [speaking, setSpeaking] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(m.content);
    toast(t("common.copied"));
  };
  const sendFeedback = async (v: "up" | "down") => {
    const next = feedback === v ? null : v;
    setFeedback(next);
    await api.post(`/api/chat/messages/${m.id}/feedback`, { value: next }).catch(() => undefined);
  };
  if (m.role === "user") {
    return (
      <div className="msg user">
        <div className="msg-body">
          {m.attachments.length > 0 && (
            <div className="attachments">
              {m.attachments.map((a) => (
                <AttachmentView key={a.fileId} a={a} />
              ))}
            </div>
          )}
          {editing ? (
            <div className="stack" style={{ minWidth: "min(560px, 80vw)" }}>
              <textarea className="textarea" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button className="btn sm ghost" onClick={() => setEditing(false)}>{t("common.cancel")}</button>
                <button
                  className="btn sm primary"
                  disabled={!draft.trim() || busy}
                  onClick={() => {
                    setEditing(false);
                    onEdit(m.id, draft.trim());
                  }}
                >
                  {t("chat.saveSend")}
                </button>
              </div>
            </div>
          ) : (
            m.content && <div className="bubble">{m.content}</div>
          )}
          {!editing && (
            <div className="msg-actions">
              <button className="icon-btn" onClick={copy} title={t("chat.copy")} aria-label={t("chat.copy")}><Copy size={15} /></button>
              {!m.id.startsWith("tmp-") && (
                <button className="icon-btn" onClick={() => { setDraft(m.content); setEditing(true); }} disabled={busy} title={t("chat.edit")} aria-label={t("chat.edit")}>
                  <Pencil size={15} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
  const streaming = m.status === "streaming";
  return (
    <div className="msg">
      <img className="msg-ai-avatar mark" src="/obsydia-avatar.png" alt="" />
      <div className="msg-body">
        {streaming && !m.content ? (
          <div className="typing" aria-label={t("chat.thinking")}><i /><i /><i /></div>
        ) : (
          <div className={streaming ? "cursor-host" : ""}>
            <Markdown text={m.content + (streaming ? " ▍" : "")} />
          </div>
        )}
        {project && <ProjectCard initial={project} onUpdate={onProjectUpdate} />}
        {m.status === "stopped" && <div className="dim" style={{ fontSize: 12.5, marginTop: 6 }}>{t("chat.stopped")}</div>}
        {m.status === "error" && (
          <div className="alert error msg-error">
            <AlertTriangle size={16} />
            <div className="grow">
              {m.errorMessage || t("err.generic")}
              {m.error === "insufficient_tokens" && (
                <> <Link className="link" to="/app/pricing" style={{ fontWeight: 600 }}>{t("nav.upgrade")}</Link></>
              )}
            </div>
          </div>
        )}
        {!streaming && (
          <div className="msg-actions">
            {m.content && <button className="icon-btn" onClick={copy} title={t("chat.copy")} aria-label={t("chat.copy")}><Copy size={15} /></button>}
            {last && !m.id.startsWith("tmp-") && (
              <button className="icon-btn" onClick={() => onRegenerate(m.id)} disabled={busy} title={t("chat.regenerate")} aria-label={t("chat.regenerate")}>
                <RefreshCw size={15} />
              </button>
            )}
            {m.content && !m.id.startsWith("tmp-") && (
              <>
                <button className={`icon-btn ${feedback === "up" ? "active" : ""}`} onClick={() => sendFeedback("up")} title={t("chat.goodResponse")} aria-label={t("chat.goodResponse")}><ThumbsUp size={15} /></button>
                <button className={`icon-btn ${feedback === "down" ? "active" : ""}`} onClick={() => sendFeedback("down")} title={t("chat.badResponse")} aria-label={t("chat.badResponse")}><ThumbsDown size={15} /></button>
              </>
            )}
            {m.content && "speechSynthesis" in window && (
              <button
                className="icon-btn"
                title={speaking ? t("chat.stopReading") : t("chat.readAloud")}
                aria-label={speaking ? t("chat.stopReading") : t("chat.readAloud")}
                onClick={() => {
                  if (speaking) {
                    speechSynthesis.cancel();
                    setSpeaking(false);
                  } else {
                    setSpeaking(true);
                    speak(m.content, locale, () => setSpeaking(false));
                  }
                }}
              >
                {speaking ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
            )}
            {m.usage && m.usage.totalTokens > 0 && (
              <span className="msg-meta mono">{t("chat.usage", { n: formatNumber(m.usage.totalTokens, locale) })}{m.usage.estimated ? " ~" : ""}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface Pending {
  id: string;
  name: string;
  kind: string;
  uploading: boolean;
}

export function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, locale, errorText } = useI18n();
  const { user, config, plan, setBalance, refreshBalance } = useSession();
  const { upsert, reload } = useConversations();
  const toast = useToast();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [projects, setProjects] = useState<Record<string, ProjectSummary>>({});
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [build, setBuild] = useState(false);
  const [model, setModel] = useState<string>("");
  const [recording, setRecording] = useState<MediaRecorder | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const skipLoad = useRef<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (cid: string) => {
    setLoading(true);
    try {
      const r = await api.get(`/api/chat/conversations/${cid}`);
      setMessages(r.messages);
      setProjects(Object.fromEntries(r.projects.map((p: any) => [p.id, p])));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) navigate("/app", { replace: true });
      else toast(errorText(e), "error");
    } finally {
      setLoading(false);
    }
  }, [navigate, toast, errorText]);

  useEffect(() => {
    if (id && skipLoad.current === id) {
      skipLoad.current = null;
      return;
    }
    abortRef.current?.abort();
    setBusy(false);
    if (!id) {
      setMessages([]);
      setProjects({});
      return;
    }
    void load(id);
  }, [id, load]);

  useLayoutEffect(() => {
    const el = threadRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 260)}px`;
  }, [input]);

  const onScroll = () => {
    const el = threadRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const runStream = async (url: string, body: unknown, assistantTmpId: string, cid: string) => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    stick.current = true;
    let realId = assistantTmpId;
    try {
      await streamPost(
        url,
        body,
        {
          onEvent: (ev, data) => {
            if (ev === "start") {
              realId = data.messageId;
              setMessages((ms) => ms.map((m) => (m.id === assistantTmpId ? { ...m, id: realId } : m)));
            } else if (ev === "delta") {
              setMessages((ms) => ms.map((m) => (m.id === realId ? { ...m, content: m.content + data.text } : m)));
            } else if (ev === "done") {
              setMessages((ms) => ms.map((m) => (m.id === realId ? { ...m, status: "complete", usage: data.usage, model: data.model } : m)));
              if (data.balance) setBalance(data.balance);
            } else if (ev === "error") {
              const msg = errorText(new ApiError(0, data.code, data.message, data.details));
              setMessages((ms) => ms.map((m) => (m.id === realId ? { ...m, status: "error", error: data.code, errorMessage: msg } : m)));
            }
          }
        },
        ctrl.signal
      );
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setMessages((ms) => ms.map((m) => (m.id === realId && m.status === "streaming" ? { ...m, status: "stopped" } : m)));
      } else {
        setMessages((ms) => ms.map((m) => (m.id === realId ? { ...m, status: "error", error: (e as ApiError).code, errorMessage: errorText(e) } : m)));
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
      upsert({ id: cid, lastMessageAt: new Date().toISOString() });
      void reload();
      if (!realId.startsWith("tmp-")) void load(cid);
      else void refreshBalance();
    }
  };

  const ensureConversation = async () => {
    if (id) return id;
    const r = await api.post("/api/chat/conversations", {});
    skipLoad.current = r.conversation.id;
    upsert(r.conversation);
    navigate(`/app/c/${r.conversation.id}`, { replace: true });
    return r.conversation.id as string;
  };

  const send = async (textArg?: string) => {
    const text = (textArg ?? input).trim();
    const ready = files.filter((f) => !f.uploading);
    if ((!text && !ready.length) || busy || files.some((f) => f.uploading)) return;
    if (build) {
      if (text.length < 8) return;
      setBusy(true);
      try {
        const r = await api.post("/api/projects/generate", { prompt: text, conversationId: id, language: user?.preferences.aiLanguage });
        setInput("");
        setBuild(false);
        skipLoad.current = null;
        if (r.conversationId !== id) navigate(`/app/c/${r.conversationId}`);
        else await load(r.conversationId);
        void reload();
      } catch (e) {
        toast(errorText(e), "error");
      } finally {
        setBusy(false);
      }
      return;
    }
    setInput("");
    setFiles([]);
    let cid: string;
    try {
      cid = await ensureConversation();
    } catch (e) {
      toast(errorText(e), "error");
      return;
    }
    const tmpUser = `tmp-u-${Date.now()}`;
    const tmpAi = `tmp-a-${Date.now()}`;
    setMessages((ms) => [
      ...ms,
      { id: tmpUser, role: "user", content: text, attachments: ready.map((f) => ({ fileId: f.id, kind: f.kind, name: f.name, mime: "", size: 0 })), status: "complete" },
      { id: tmpAi, role: "assistant", content: "", attachments: [], status: "streaming" }
    ]);
    if (!messages.length) upsert({ id: cid, title: text.slice(0, 60) || ready[0]?.name || "New conversation" });
    await runStream(`/api/chat/conversations/${cid}/messages`, { content: text, attachments: ready.map((f) => f.id), model: model || undefined }, tmpAi, cid);
  };

  const regenerate = async (messageId: string) => {
    if (!id || busy) return;
    const tmpAi = `tmp-a-${Date.now()}`;
    setMessages((ms) => {
      const idx = ms.findIndex((m) => m.id === messageId);
      return [...ms.slice(0, idx), { id: tmpAi, role: "assistant", content: "", attachments: [], status: "streaming" }];
    });
    await runStream(`/api/chat/messages/${messageId}/regenerate`, { model: model || undefined }, tmpAi, id);
  };

  const editAndResend = async (messageId: string, text: string) => {
    if (!id || busy) return;
    const tmpAi = `tmp-a-${Date.now()}`;
    setMessages((ms) => {
      const idx = ms.findIndex((m) => m.id === messageId);
      return [...ms.slice(0, idx), { ...ms[idx]!, content: text }, { id: tmpAi, role: "assistant", content: "", attachments: [], status: "streaming" }];
    });
    await runStream(`/api/chat/messages/${messageId}/edit`, { content: text, model: model || undefined }, tmpAi, id);
  };

  const stop = () => abortRef.current?.abort();

  const onPickFiles = async (list: FileList | null) => {
    if (!list) return;
    for (const file of Array.from(list).slice(0, 10)) {
      const tmp = `up-${Math.random()}`;
      const kind = file.type.startsWith("image/") ? "image" : /\.zip$/i.test(file.name) ? "zip" : /\.(pdf|txt|md)$/i.test(file.name) ? "document" : "code";
      setFiles((f) => [...f, { id: tmp, name: file.name, kind, uploading: true }]);
      try {
        const r = await api.upload("/api/files", "file", file, file.name);
        setFiles((f) => f.map((x) => (x.id === tmp ? { id: r.file.id, name: r.file.name, kind: r.file.kind, uploading: false } : x)));
      } catch (e) {
        setFiles((f) => f.filter((x) => x.id !== tmp));
        toast(`${t("chat.uploadFailed")}: ${errorText(e)}`, "error");
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const toggleRecording = async () => {
    if (recording) {
      recording.stop();
      return;
    }
    if (!config?.voice.transcription) {
      toast(t("chat.voiceUnavailable"), "info");
      return;
    }
    if (!plan?.voiceInput) {
      toast(t("err.plan_upgrade_required"), "info");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m)) || "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        setRecording(null);
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 1000) return;
        setTranscribing(true);
        try {
          const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
          const r = await api.upload("/api/files/transcribe", "audio", blob, `voice.${ext}`, { language: user?.preferences.aiLanguage || "auto" });
          setInput((v) => (v ? `${v} ${r.text}` : r.text));
          taRef.current?.focus();
        } catch (e) {
          toast(errorText(e), "error");
        } finally {
          setTranscribing(false);
        }
      };
      rec.start();
      setRecording(rec);
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const suggestions = [
    { icon: Layers, text: t("chat.suggest1"), build: true },
    { icon: Code2, text: t("chat.suggest2") },
    { icon: Bug, text: t("chat.suggest3") },
    { icon: Sparkles, text: t("chat.suggest4") }
  ];
  const models = config?.ai.models || [];
  const placeholder = build ? t("chat.placeholderBuild") : t("chat.placeholder", { name: config?.ai.displayName || "OBSYDIA" });

  return (
    <div className="chat">
      <div className="thread" ref={threadRef} onScroll={onScroll}>
        {!id && messages.length === 0 ? (
          <div className="welcome">
            <Mark size={56} />
            <h1 style={{ marginTop: 20 }}>{config?.ai.welcomeMessage}</h1>
            <p>{t("brand.tagline")}</p>
            <div className="suggestions">
              {suggestions.map((s) => (
                <button
                  key={s.text}
                  className="suggestion"
                  onClick={() => {
                    setInput(s.text);
                    if (s.build) setBuild(true);
                    taRef.current?.focus();
                  }}
                >
                  <s.icon size={16} />
                  <span>{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="thread-inner">
            {loading && messages.length === 0
              ? [1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 18, width: `${90 - i * 15}%`, margin: "18px 0" }} />)
              : messages.map((m) => (
                  <MessageView
                    key={m.id}
                    m={m}
                    last={m.id === lastAssistant?.id}
                    busy={busy}
                    onRegenerate={regenerate}
                    onEdit={editAndResend}
                    project={m.projectId && m.role === "assistant" ? projects[m.projectId] : undefined}
                    onProjectUpdate={() => id && load(id)}
                  />
                ))}
            {Object.values(projects)
              .filter((p) => !messages.some((m) => m.role === "assistant" && m.projectId === p.id))
              .map((p) => (
                <div className="msg" key={p.id}>
                  <img className="msg-ai-avatar mark" src="/obsydia-avatar.png" alt="" />
                  <div className="msg-body">
                    <ProjectCard initial={p} onUpdate={() => id && load(id)} />
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
      <div className="composer-wrap">
        <div className={`composer ${build ? "build" : ""}`}>
          {files.length > 0 && (
            <div className="composer-files">
              {files.map((f) => (
                <span key={f.id} className="chip">
                  {f.uploading ? <Loader2 size={13} className="spin" /> : <AttIcon kind={f.kind} />}
                  <span className="truncate">{f.name}</span>
                  <button onClick={() => setFiles((l) => l.filter((x) => x.id !== f.id))} aria-label={t("common.delete")}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            placeholder={recording ? t("chat.recording") : transcribing ? t("chat.transcribing") : placeholder}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
                e.preventDefault();
                void send();
              }
            }}
            aria-label={placeholder}
          />
          <div className="composer-bar">
            <input ref={fileRef} type="file" multiple hidden accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.md,.zip,.js,.mjs,.cjs,.jsx,.ts,.tsx,.json,.html,.css,.scss,.py,.java,.go,.rs,.php,.rb,.c,.cpp,.h,.cs,.sql,.yml,.yaml,.sh,.vue,.svelte,.xml,.csv" onChange={(e) => onPickFiles(e.target.files)} />
            <button className="icon-btn" onClick={() => fileRef.current?.click()} title={`${t("chat.attach")} — ${t("chat.attachmentKinds")}`} aria-label={t("chat.attach")} disabled={build}>
              <Paperclip size={18} />
            </button>
            <button className={`icon-btn ${recording ? "rec" : ""}`} onClick={toggleRecording} title={config?.voice.transcription ? t("chat.voice") : t("chat.voiceUnavailable")} aria-label={t("chat.voice")} disabled={transcribing}>
              {transcribing ? <Loader2 size={18} className="spin" /> : <Mic size={18} />}
            </button>
            <button className={`toggle-chip ${build ? "on" : ""}`} onClick={() => setBuild((b) => !b)} title={t("chat.buildModeHint")} aria-pressed={build}>
              <Hammer size={14} /> {t("chat.buildMode")}
            </button>
            <div className="grow" />
            {models.length > 1 && (
              <select className="model-select" value={model || config?.ai.model} onChange={(e) => setModel(e.target.value)} aria-label="Model">
                {models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            )}
            {busy && !build ? (
              <button className="send stop" onClick={stop} aria-label={t("chat.stop")} title={t("chat.stop")}>
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button className="send" onClick={() => send()} disabled={busy || (!input.trim() && !files.length) || files.some((f) => f.uploading)} aria-label={t("chat.send")}>
                {busy ? <Loader2 size={16} className="spin" /> : <ArrowUp size={18} />}
              </button>
            )}
          </div>
        </div>
        <div className="composer-note">{t("chat.disclaimer")}</div>
      </div>
    </div>
  );
}
