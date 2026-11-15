import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  PanelLeftClose, PanelLeft, SquarePen, Search, FolderKanban, KeyRound, CreditCard, Settings as SettingsIcon, Gift, Users,
  ShieldCheck, LogOut, MoreHorizontal, Pin, PinOff, Pencil, Trash2, Sparkles, Menu
} from "lucide-react";
import { Logo } from "./Logo";
import { LanguageSwitch } from "./LanguageSwitch";
import { ConversationsProvider, useConversations, type ConversationItem } from "../lib/conversations";
import { useSession } from "../lib/session";
import { useI18n } from "../lib/i18n";
import { api, compact, relativeTime } from "../lib/api";
import { Confirm, Modal } from "./Modal";
import { useToast } from "./Toast";
import { SearchDialog } from "./SearchDialog";

function ConvRow({ c, active, onNavigate }: { c: ConversationItem; active: boolean; onNavigate: () => void }) {
  const { t, errorText } = useI18n();
  const { reload, remove, upsert } = useConversations();
  const navigate = useNavigate();
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(c.title);
  const [confirm, setConfirm] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);
  const togglePin = async () => {
    setMenu(false);
    try {
      if (c.pinned) await api.del(`/api/chat/conversations/${c.id}/pin`);
      else await api.post(`/api/chat/conversations/${c.id}/pin`);
      await reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  const rename = async () => {
    try {
      await api.patch(`/api/chat/conversations/${c.id}`, { title });
      upsert({ id: c.id, title });
      setRenaming(false);
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  const del = async () => {
    try {
      await api.del(`/api/chat/conversations/${c.id}`);
      remove(c.id);
      setConfirm(false);
      if (active) navigate("/app");
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  return (
    <div className={`conv ${active ? "active" : ""}`} ref={ref}>
      <Link to={`/app/c/${c.id}`} className="grow truncate" onClick={onNavigate} title={c.title}>
        {c.title}
      </Link>
      <button className="icon-btn conv-more" aria-label={t("common.actions")} aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
        <MoreHorizontal size={16} />
      </button>
      {menu && (
        <div className="menu" style={{ right: 4, top: 32 }}>
          <button onClick={togglePin}>
            {c.pinned ? <PinOff size={14} /> : <Pin size={14} />} {c.pinned ? t("chat.unpin") : t("chat.pin")}
          </button>
          <button
            onClick={() => {
              setMenu(false);
              setRenaming(true);
            }}
          >
            <Pencil size={14} /> {t("common.rename")}
          </button>
          <button
            className="danger"
            onClick={() => {
              setMenu(false);
              setConfirm(true);
            }}
          >
            <Trash2 size={14} /> {t("common.delete")}
          </button>
        </div>
      )}
      <Modal
        open={renaming}
        onClose={() => setRenaming(false)}
        title={t("chat.rename")}
        width={420}
        footer={
          <>
            <button className="btn ghost" onClick={() => setRenaming(false)}>
              {t("common.cancel")}
            </button>
            <button className="btn primary" onClick={rename} disabled={!title.trim()}>
              {t("common.save")}
            </button>
          </>
        }
      >
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus onKeyDown={(e) => e.key === "Enter" && rename()} />
      </Modal>
      <Confirm open={confirm} onClose={() => setConfirm(false)} onConfirm={del} title={t("chat.delete")} body={t("chat.deleteConfirm")} confirmLabel={t("common.delete")} cancelLabel={t("common.cancel")} danger />
    </div>
  );
}

function Sidebar({ onCollapse, onNavigate }: { onCollapse: () => void; onNavigate: () => void }) {
  const { t, locale } = useI18n();
  const { user, balance, logout } = useSession();
  const { pinned, recent, loading } = useConversations();
  const { id } = useParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState(false);
  const pinnedIds = new Set(pinned.map((p) => p.id));
  const pct = balance ? Math.min(100, (balance.remaining / Math.max(1, balance.total)) * 100) : 0;
  const nav = [
    { to: "/app/projects", icon: FolderKanban, label: t("nav.projects") },
    { to: "/app/developer", icon: KeyRound, label: t("nav.developer") },
    { to: "/app/billing", icon: CreditCard, label: t("nav.billing") },
    { to: "/app/referrals", icon: Gift, label: t("nav.referrals") },
    { to: "/app/team", icon: Users, label: t("nav.team") },
    { to: "/app/settings", icon: SettingsIcon, label: t("nav.settings") },
    ...(user?.role === "admin" ? [{ to: "/app/admin", icon: ShieldCheck, label: t("nav.admin") }] : [])
  ];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <aside className="sidebar">
      <div className="sb-top">
        <Logo to="/app" compact />
        <button className="icon-btn" onClick={onCollapse} aria-label={t("nav.menu")}>
          <PanelLeftClose size={18} />
        </button>
      </div>
      <div className="sb-actions">
        <button
          className="sb-item primary-action"
          onClick={() => {
            navigate("/app");
            onNavigate();
          }}
        >
          <SquarePen size={16} /> {t("nav.newChat")}
        </button>
        <button className="sb-item" onClick={() => setSearch(true)}>
          <Search size={16} /> <span className="grow">{t("nav.search")}</span> <span className="kbd">⌘K</span>
        </button>
      </div>
      <div className="sb-scroll">
        {pinned.length > 0 && (
          <div className="sb-section">
            <span className="label">{t("nav.pinned")}</span>
            {pinned.map((c) => (
              <ConvRow key={c.id} c={c} active={c.id === id} onNavigate={onNavigate} />
            ))}
          </div>
        )}
        <div className="sb-section">
          <span className="label">{t("nav.recent")}</span>
          {loading && [1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 22, margin: "8px 10px" }} />)}
          {!loading && recent.filter((c) => !pinnedIds.has(c.id)).length === 0 && <div className="dim" style={{ padding: "4px 10px", fontSize: 13 }}>{t("nav.noChats")}</div>}
          {recent
            .filter((c) => !pinnedIds.has(c.id))
            .map((c) => (
              <ConvRow key={c.id} c={c} active={c.id === id} onNavigate={onNavigate} />
            ))}
        </div>
      </div>
      <nav className="sb-nav">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `sb-item ${isActive ? "active" : ""}`} onClick={onNavigate}>
            <n.icon size={16} /> {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="sb-account">
        {balance && (
          <div className="balance-mini">
            <div className="row">
              <span className="badge primary">{t(`plan.${user!.plan}` as any)}</span>
              <span className="muted">{t("nav.tokensLeft", { n: compact(balance.remaining, locale) })}</span>
            </div>
            <div className="progress">
              <i style={{ width: `${pct}%` }} />
            </div>
            <div className="row">
              <span className="dim">{t("nav.resets", { when: relativeTime(balance.resetAt, locale) })}</span>
              {user!.plan !== "premium" && user!.plan !== "custom" && (
                <Link to="/app/billing#plans" className="link" onClick={onNavigate} style={{ fontSize: 12, fontWeight: 600, display: "inline-flex", gap: 4, alignItems: "center" }}>
                  <Sparkles size={12} /> {t("nav.upgrade")}
                </Link>
              )}
            </div>
          </div>
        )}
        <div className="row">
          <div className="acct grow">
            <div className="avatar">{user?.name.slice(0, 1).toUpperCase()}</div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="acct-name truncate">{user?.name}</div>
              <div className="acct-meta truncate">{user?.email}</div>
            </div>
          </div>
          <button
            className="icon-btn"
            aria-label={t("nav.logout")}
            title={t("nav.logout")}
            onClick={async () => {
              await logout();
              navigate("/");
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
        <div style={{ marginTop: 8 }}>
          <LanguageSwitch compact />
        </div>
      </div>
      <SearchDialog open={search} onClose={() => setSearch(false)} onNavigate={onNavigate} />
    </aside>
  );
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const loc = useLocation();
  const { t } = useI18n();
  useEffect(() => setMobileOpen(false), [loc.pathname]);
  const toggle = () => {
    if (window.matchMedia("(max-width: 900px)").matches) setMobileOpen((o) => !o);
    else setCollapsed((c) => !c);
  };
  return (
    <ConversationsProvider>
      <div className={`shell ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="scrim" onClick={() => setMobileOpen(false)} />
        <Sidebar onCollapse={toggle} onNavigate={() => setMobileOpen(false)} />
        <main className="main">
          <div className="mobile-toggle-host" data-collapsed={collapsed}>
            <button className="icon-btn sidebar-toggle" onClick={toggle} aria-label={t("nav.menu")}>
              {collapsed ? <PanelLeft size={18} /> : <Menu size={18} />}
            </button>
          </div>
          <Outlet context={{ toggleSidebar: toggle, collapsed }} />
        </main>
      </div>
    </ConversationsProvider>
  );
}
