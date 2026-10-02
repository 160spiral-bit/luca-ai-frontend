import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Pencil, Pin, PinOff, Plus, Search, Settings as SettingsIcon, ShieldCheck, Trash2, X, PanelLeft } from "lucide-react";
import type { AuthUser, Profile, Session } from "../lib/store";

function relTime(ts: number): string {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  return Math.floor(s / 86400) + "d";
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "U";

interface Props {
  sessions: Session[]; activeId: string | null; search: string;
  onSearch: (q: string) => void; onSelect: (id: string) => void; onNew: () => void;
  onRename: (id: string, t: string) => void; onTogglePin: (id: string) => void; onDelete: (id: string) => void;
  onOpenSettings: () => void; onOpenProfile: () => void; onClearAll: () => void;
  onLogout: () => void;
  isAdmin?: boolean; onOpenAdmin?: () => void;
  authUser: AuthUser | null; profile: Profile | null;
  mobileOpen: boolean; onCloseMobile: () => void;
  collapsed: boolean; onToggleSidebar: () => void;
}

export default function Sidebar(p: Props) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Session | null>(null);
  const [userMenu, setUserMenu] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const renameRef = useRef<HTMLInputElement | null>(null);

  const { mobileOpen, onCloseMobile } = p;
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseMobile(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); };
  }, [mobileOpen, onCloseMobile]);
  useEffect(() => {
    if (!menuFor) return;
    const onDoc = (e: MouseEvent) => {
      if (rowMenuRef.current && !rowMenuRef.current.contains(e.target as Node)) { setMenuFor(null); }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenuFor(null); setUserMenu(false); } };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [menuFor]);
  useEffect(() => {
    if (!userMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenu(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [userMenu]);
  useEffect(() => { if (renamingId) { renameRef.current?.focus(); renameRef.current?.select(); } }, [renamingId]);

  // Local draft + debounce: filtering walks every message of every chat, so
  // don't re-filter (and re-render the app) on each keystroke.
  const { search: searchProp, onSearch } = p;
  const [draft, setDraft] = useState(searchProp);
  useEffect(() => { setDraft(searchProp); }, [searchProp]);
  useEffect(() => {
    if (draft === searchProp) return;
    const id = window.setTimeout(() => onSearch(draft), 180);
    return () => window.clearTimeout(id);
  }, [draft, searchProp, onSearch]);
  const q = draft.trim().toLowerCase();
  // Copy before sorting: Array.prototype.sort sorts IN PLACE, and when there
  // is no query `visible` would otherwise BE the state array from props.
  const visible = useMemo(() => {
    const base = q
      ? p.sessions.filter((s) => s.title.toLowerCase().includes(q) || s.messages.some((m) => m.content.toLowerCase().includes(q)))
      : [...p.sessions];
    return base.sort((a, b) => Number(b.pinned || false) - Number(a.pinned || false) || (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [p.sessions, q]);
  const commitRename = () => { if (renamingId && renameValue.trim()) p.onRename(renamingId, renameValue.trim()); setRenamingId(null); };
  const lastActivity = (s: Session) => s.messages.length ? (s.messages[s.messages.length - 1]?.ts || s.updatedAt || 0) : (s.createdAt || 0);

  const displayName = (p.profile?.name || p.authUser?.name || "User").trim() || "User";

  return (
    <>
      <div className={`scrim sidebar-scrim ${p.mobileOpen ? "show" : ""}`} onClick={p.onCloseMobile} aria-hidden="true" />
      <aside className={`sidebar ${p.collapsed ? "hidden-side" : ""} ${p.mobileOpen ? "mobile-open" : ""}`} aria-label="Sidebar">
        <div className="sb-head">
          <button className="wordmark" onClick={() => { p.onNew(); p.onCloseMobile(); }} aria-label="Luca home">Luca</button>
          <button className="icon-btn only-desktop" onClick={p.onToggleSidebar} aria-label="Collapse sidebar"><PanelLeft size={16} /></button>
          <button className="icon-btn only-mobile" onClick={p.onCloseMobile} aria-label="Close sidebar"><X size={20} /></button>
        </div>
        <button className="new-chat" onClick={() => { p.onNew(); p.onCloseMobile(); }}>
          <Plus size={14} />New chat
        </button>
        <div className="search">
          <Search size={14} />
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search chats" aria-label="Search chats" />
        </div>
        <div className="label">Recents</div>
        <nav className="recents" aria-label="Recent chats">
          {visible.length === 0 && (
            <div className="empty-recents">{q ? "No chats found" : "No chats yet"}</div>
          )}
          {visible.map((s) => (
            <div key={s.id} className="chat-row">
              {renamingId === s.id ? (
                <div className="rename-row">
                  <input ref={renameRef} value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitRename(); } if (e.key === "Escape") setRenamingId(null); }}
                    onBlur={commitRename} aria-label="Rename chat"
                    className="rename-input" />
                  <button className="icon-btn rename-save" onMouseDown={(e) => { e.preventDefault(); commitRename(); }} aria-label="Save name"><Check size={14} /></button>
                </div>
              ) : (
                <>
                  {/* Real button, not role=button: buttons nested inside a
                      role=button container fail axe nested-interactive, and a
                      native button gets Enter/Space/focus for free. The del
                      buttons are siblings (same relative wrapper, so absolute
                      positioning is unchanged), never children. */}
                  <button
                    className={`chat-item ${s.id === p.activeId ? "active" : ""}`}
                    onClick={() => { p.onSelect(s.id); p.onCloseMobile(); }}
                    aria-label={`Open chat ${s.title}`}
                    aria-current={s.id === p.activeId ? "page" : undefined}
                  >
                    <span className="title">{s.title}</span>
                    {s.pinned && <Pin size={10} className="pin-ico" />}
                    <time>{relTime(lastActivity(s))}</time>
                  </button>
                  <button className="del del-delete" title="Delete" aria-label={`Delete chat ${s.title}`}
                    onClick={() => setConfirmDelete(s)}>
                    <Trash2 size={12} />
                  </button>
                  <button className="del del-more" title="More options" aria-label="Chat options"
                    onClick={() => setMenuFor(menuFor === s.id ? null : s.id)}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
                  </button>
                </>
              )}
              {menuFor === s.id && (
                <div ref={rowMenuRef} className="row-menu-pop" role="menu">
                  <button role="menuitem" onClick={() => { p.onTogglePin(s.id); setMenuFor(null); }}>{s.pinned ? <PinOff size={13} /> : <Pin size={13} />}{s.pinned ? "Unpin" : "Pin"}</button>
                  <button role="menuitem" onClick={() => { setRenamingId(s.id); setRenameValue(s.title); setMenuFor(null); }}><Pencil size={13} />Rename</button>
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="sb-foot">
          {p.isAdmin && p.onOpenAdmin && (
            <button className="foot-row" onClick={p.onOpenAdmin}>
              <ShieldCheck size={14} />Admin Panel
            </button>
          )}
          <button className="foot-row" onClick={p.onOpenSettings}>
            <SettingsIcon size={14} />Settings
          </button>
          <div className="user-wrap">
            <button className="foot-row" onClick={() => setUserMenu((v) => !v)} aria-expanded={userMenu} aria-haspopup="menu">
              <span className="avatar" aria-hidden="true">
                {p.profile?.avatar ? <img src={p.profile.avatar} alt="" /> : initials(displayName)}
              </span>
              <span className="user-meta"><strong>{displayName}</strong><small>{p.isAdmin ? "Admin" : "Free"}</small></span>
            </button>
            <div ref={userMenuRef} className={`user-menu ${userMenu ? "open" : ""}`} role="menu">
              <button role="menuitem" onClick={() => { setUserMenu(false); p.onOpenProfile(); }}>Profile</button>
              <button role="menuitem" onClick={() => {
                setUserMenu(false);
                const id = p.authUser?.id || "";
                if (id && navigator.clipboard) void navigator.clipboard.writeText(id);
              }}>Copy user ID</button>
              <button role="menuitem" onClick={() => {
                setUserMenu(false); setConfirmClear(true);
              }}>Clear all chats</button>
              <button role="menuitem" onClick={() => { setUserMenu(false); p.onLogout(); }}>Log out</button>
            </div>
          </div>
        </div>
      </aside>
      {confirmDelete && (
        <Dialog.Root
          open
          onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="scrim" />
            <Dialog.Content className="modal" aria-describedby="delete-chat-desc delete-chat-desc-sr">
              <div className="modal-head"><Dialog.Title asChild><h2>Delete chat?</h2></Dialog.Title></div>
              <Dialog.Description className="sr-only" id="delete-chat-desc-sr">
                Permanently delete chat “{confirmDelete.title}”. This cannot be undone.
              </Dialog.Description>
              <p className="modal-text modal-text--ellipsis" id="delete-chat-desc">
                “{confirmDelete.title}” will be gone for good.
              </p>
              <div className="modal-actions">
                <Dialog.Close className="btn-ghost btn-auto">Cancel</Dialog.Close>
                <button
                  className="btn-ghost btn-danger btn-auto"
                  onClick={() => { p.onDelete(confirmDelete.id); setConfirmDelete(null); }}
                >
                  Delete
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
      {confirmClear && (
        <Dialog.Root
          open
          onOpenChange={(open) => { if (!open) setConfirmClear(false); }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="scrim" />
            <Dialog.Content className="modal" aria-describedby="clear-chats-desc clear-chats-desc-sr">
              <div className="modal-head"><Dialog.Title asChild><h2>Clear all chats?</h2></Dialog.Title></div>
              <Dialog.Description className="sr-only" id="clear-chats-desc-sr">
                Clear all chats on this device. Every chat will be permanently deleted with no undo.
              </Dialog.Description>
              <p className="modal-text" id="clear-chats-desc">
                Every chat on this device will be gone for good. No undo.
              </p>
              <div className="modal-actions">
                <Dialog.Close className="btn-ghost btn-auto">Cancel</Dialog.Close>
                <button
                  className="btn-ghost btn-danger btn-auto"
                  onClick={() => { setConfirmClear(false); p.onClearAll(); }}
                >
                  Clear all
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </>
  );
}
