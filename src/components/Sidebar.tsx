import { useEffect, useRef, useState } from "react";
import { Check, Pencil, Pin, PinOff, Plus, Search, Settings as SettingsIcon, ShieldCheck, Trash2, X, PanelLeft } from "lucide-react";
import Logo from "./Logo";
import { dayBucket } from "../lib/store";
import type { Profile, Session } from "../lib/store";

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "U";

interface Props {
  sessions: Session[]; activeId: string | null; search: string;
  onSearch: (q: string) => void; onSelect: (id: string) => void; onNew: () => void;
  onRename: (id: string, t: string) => void; onTogglePin: (id: string) => void; onDelete: (id: string) => void;
  onOpenSettings: () => void; onOpenProfile: () => void;
  isAdmin?: boolean; onOpenAdmin?: () => void;
  profile: Profile | null; mobileOpen: boolean; onCloseMobile: () => void;
  collapsed: boolean; onToggleSidebar: () => void;
}

export default function Sidebar(p: Props) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const renameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!menuFor) return;
    const onDoc = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuFor(null); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [menuFor]);
  useEffect(() => { if (renamingId) { renameRef.current?.focus(); renameRef.current?.select(); } }, [renamingId]);

  const q = p.search.trim().toLowerCase();
  const filtered = q ? p.sessions.filter((s) => s.title.toLowerCase().includes(q) || s.messages.some((m) => m.content.toLowerCase().includes(q))) : p.sessions;
  const groups: Record<string, Session[]> = { Pinned: [], Today: [], Yesterday: [], "Previous 7 days": [], Older: [] };
  for (const s of [...filtered].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))) {
    (groups[s.pinned && !q ? "Pinned" : dayBucket(s.updatedAt || s.createdAt)] || groups.Older).push(s);
  }
  const commitRename = () => { if (renamingId && renameValue.trim()) p.onRename(renamingId, renameValue.trim()); setRenamingId(null); };

  return (
    <>
      <div className={`scrim ${p.mobileOpen ? "show" : ""}`} onClick={p.onCloseMobile} aria-hidden="true" />
      <aside className={`side ${p.collapsed ? "hidden-side" : ""} ${p.mobileOpen ? "mobile-open" : ""}`}>
        <div className="side-head">
          <div className="logo">
            <Logo size={17} />
            <p>Luca</p>
          </div>
          <span style={{ flex: 1 }} />
          <button className="icon-btn only-desktop" onClick={p.onToggleSidebar} aria-label="Close sidebar"><PanelLeft size={15} /></button>
          <button className="icon-btn only-mobile" onClick={p.onCloseMobile} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="side-actions">
          <button className="btn-new" onClick={() => { p.onNew(); p.onCloseMobile(); }}><Plus size={15} />New chat</button>
        </div>
        <div className="side-search">
          <Search size={13} />
          <input value={p.search} onChange={(e) => p.onSearch(e.target.value)} placeholder="Search chats" aria-label="Search chats" />
        </div>
        <nav className="recents" aria-label="Recent chats">
          {p.sessions.length === 0 && <div style={{ padding: "24px 12px", fontSize: 13, color: "var(--ink-3)", lineHeight: 1.6 }}>no chats created yet</div>}
          {Object.entries(groups).map(([g, list]) => list.length ? (
            <div key={g}>
              <div className="recents-label">{g === "Pinned" ? <Pin size={9} style={{ marginRight: 4 }} /> : null}{g}</div>
              {list.map((s) => (
                <div key={s.id} style={{ position: "relative" }}>
                  {renamingId === s.id ? (
                    <div style={{ display: "flex", gap: 4, padding: "2px 0" }}>
                      <input ref={renameRef} value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitRename(); } if (e.key === "Escape") setRenamingId(null); }}
                        onBlur={commitRename} aria-label="Rename chat"
                        style={{ flex: 1, minWidth: 0, borderRadius: 999, border: "1px solid var(--line-strong)", background: "var(--surface)", padding: "6px 12px", fontSize: 13 }} />
                      <button className="icon-btn" style={{ width: 28, height: 28 }} onMouseDown={(e) => { e.preventDefault(); commitRename(); }} aria-label="Save"><Check size={13} /></button>
                    </div>
                  ) : (
                    <button className={`chat-row ${s.id === p.activeId ? "active" : ""}`} onClick={() => { p.onSelect(s.id); p.onCloseMobile(); }}>
                      <span className="title">{s.title}</span>
                      {s.pinned && <Pin size={10} style={{ flexShrink: 0, color: "var(--ink-3)" }} />}
                      <span role="button" tabIndex={0} aria-label="Chat options" className={`row-menu icon-btn ${menuFor === s.id ? "open" : ""}`} style={{ width: 24, height: 24, position: "static" }}
                        onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === s.id ? null : s.id); setConfirmDelete(null); }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setMenuFor(menuFor === s.id ? null : s.id); } }}>
                        <svg width={13} height={13} viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
                      </span>
                    </button>
                  )}
                  {menuFor === s.id && (
                    <div ref={menuRef} className="row-menu-pop" role="menu">
                      {confirmDelete === s.id ? (
                        <div style={{ padding: 6 }}>
                          <div style={{ fontSize: 12, color: "var(--ink-2)", padding: "2px 6px 10px" }}>Delete this chat?</div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className="btn-primary" style={{ padding: "7px 10px", fontSize: 12 }} onClick={() => { p.onDelete(s.id); setMenuFor(null); setConfirmDelete(null); }}>Delete</button>
                            <button className="btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }} onClick={() => setConfirmDelete(null)}>Keep</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button role="menuitem" onClick={() => { p.onTogglePin(s.id); setMenuFor(null); }}>{s.pinned ? <PinOff size={13} /> : <Pin size={13} />}{s.pinned ? "Unpin" : "Pin"}</button>
                          <button role="menuitem" onClick={() => { setRenamingId(s.id); setRenameValue(s.title); setMenuFor(null); }}><Pencil size={13} />Rename</button>
                          <button role="menuitem" className="danger" onClick={() => setConfirmDelete(s.id)}><Trash2 size={13} />Delete</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null)}
        </nav>
        <div className="side-foot">
          {p.isAdmin && p.onOpenAdmin && (
            <button onClick={p.onOpenAdmin} style={{ fontWeight: 600 }}><ShieldCheck size={15} />Admin Panel</button>
          )}
          <button onClick={p.onOpenSettings}><SettingsIcon size={15} />Settings</button>
          <button className="account" onClick={p.onOpenProfile} aria-label="Open profile">
            {p.profile?.avatar
              ? <span className="avatar avatar-img" aria-hidden="true"><img src={p.profile.avatar} alt="" /></span>
              : <span className="avatar" aria-hidden="true">{initials((p.profile?.name || "User").trim())}</span>}
            <span>
              <p className="name">{(p.profile?.name || "User").trim() || "User"}</p>
              <p className="plan">{p.isAdmin ? "Admin" : "Free"}</p>
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
