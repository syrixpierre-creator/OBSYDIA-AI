import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquare, Search } from "lucide-react";
import { Modal } from "./Modal";
import { api, relativeTime } from "../lib/api";
import { useI18n } from "../lib/i18n";

export function SearchDialog({ open, onClose, onNavigate }: { open: boolean; onClose: () => void; onNavigate: () => void }) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ conversations: any[]; messages: any[] } | null>(null);
  useEffect(() => {
    if (!open) {
      setQ("");
      setRes(null);
    }
  }, [open]);
  useEffect(() => {
    if (!q.trim()) return setRes(null);
    const ctrl = new AbortController();
    const h = setTimeout(() => {
      api.get(`/api/chat/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal }).then(setRes).catch(() => undefined);
    }, 200);
    return () => {
      clearTimeout(h);
      ctrl.abort();
    };
  }, [q]);
  const go = (id: string) => {
    navigate(`/app/c/${id}`);
    onClose();
    onNavigate();
  };
  return (
    <Modal open={open} onClose={onClose} width={620}>
      <div className="row" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12, marginBottom: 8 }}>
        <Search size={18} color="var(--text-tertiary)" />
        <input className="input" style={{ border: 0, boxShadow: "none", background: "transparent", paddingLeft: 4 }} autoFocus placeholder={t("chat.searchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div style={{ maxHeight: 420, overflowY: "auto" }}>
        {res && res.conversations.length === 0 && res.messages.length === 0 && <div className="empty" style={{ padding: 24 }}>{t("chat.noResults")}</div>}
        {res?.conversations.map((c) => (
          <button key={c.id} className="sb-item" onClick={() => go(c.id)}>
            <MessageSquare size={15} /> <span className="grow truncate">{c.title}</span>
            <span className="dim" style={{ fontSize: 12 }}>{relativeTime(c.lastMessageAt, locale)}</span>
          </button>
        ))}
        {res?.messages.map((m) => (
          <button key={m.messageId} className="sb-item" style={{ height: "auto", padding: "8px 10px", alignItems: "flex-start" }} onClick={() => go(m.conversationId)}>
            <MessageSquare size={15} style={{ marginTop: 3 }} />
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="truncate" style={{ display: "block", color: "var(--text-primary)", fontSize: 13.5 }}>{m.title}</span>
              <span className="dim" style={{ fontSize: 12.5, display: "block", whiteSpace: "normal" }}>{m.snippet}</span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
