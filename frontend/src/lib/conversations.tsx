import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";

export interface ConversationItem {
  id: string;
  title: string;
  lastMessageAt: string;
  messageCount: number;
  projectId: string | null;
  pinned: boolean;
}

interface Ctx {
  pinned: ConversationItem[];
  recent: ConversationItem[];
  loading: boolean;
  reload: () => Promise<void>;
  upsert: (c: Partial<ConversationItem> & { id: string }) => void;
  remove: (id: string) => void;
}

const ConvContext = createContext<Ctx | null>(null);

export function ConversationsProvider({ children }: { children: ReactNode }) {
  const [pinned, setPinned] = useState<ConversationItem[]>([]);
  const [recent, setRecent] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    try {
      const r = await api.get<{ pinned: ConversationItem[]; conversations: ConversationItem[] }>("/api/chat/conversations?limit=80");
      setPinned(r.pinned);
      setRecent(r.conversations);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const upsert = useCallback((c: Partial<ConversationItem> & { id: string }) => {
    setRecent((list) => {
      const existing = list.find((x) => x.id === c.id);
      const merged = { ...(existing || { title: "New conversation", lastMessageAt: new Date().toISOString(), messageCount: 0, projectId: null, pinned: false }), ...c } as ConversationItem;
      return [merged, ...list.filter((x) => x.id !== c.id)];
    });
    setPinned((list) => list.map((x) => (x.id === c.id ? { ...x, ...c } : x)));
  }, []);
  const remove = useCallback((id: string) => {
    setRecent((l) => l.filter((x) => x.id !== id));
    setPinned((l) => l.filter((x) => x.id !== id));
  }, []);
  const value = useMemo(() => ({ pinned, recent, loading, reload, upsert, remove }), [pinned, recent, loading, reload, upsert, remove]);
  return <ConvContext.Provider value={value}>{children}</ConvContext.Provider>;
}

export function useConversations() {
  const ctx = useContext(ConvContext);
  if (!ctx) throw new Error("ConversationsProvider missing");
  return ctx;
}
