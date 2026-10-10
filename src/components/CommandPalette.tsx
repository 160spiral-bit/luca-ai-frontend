import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { MessageSquare, MessageSquarePlus, Search, Settings, Sun, Moon, User, Download, Shield } from "lucide-react";
import type { Session } from "../lib/store";

interface Action {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

export default function CommandPalette(p: {
  open: boolean;
  onClose: () => void;
  sessions: Session[];
  activeId: string | null;
  theme: string;
  isAdmin: boolean;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onOpenProfile: () => void;
  onOpenAdmin: () => void;
  onExportActive: () => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (p.open) { setQ(""); setSel(0); }
  }, [p.open]);

  const actions = useMemo<Action[]>(() => {
    const base: Action[] = [
      { id: "new", label: "New chat", hint: "⌘ N", icon: <MessageSquarePlus size={15} />, run: () => { p.onNewChat(); p.onClose(); } },
      { id: "theme", label: p.theme === "dark" ? "Switch to light theme" : "Switch to dark theme", hint: "⌘ ⇧ L", icon: p.theme === "dark" ? <Sun size={15} /> : <Moon size={15} />, run: () => { p.onToggleTheme(); p.onClose(); } },
      { id: "settings", label: "Open settings", hint: "⌘ ,", icon: <Settings size={15} />, run: () => { p.onOpenSettings(); p.onClose(); } },
      { id: "profile", label: "Your profile", icon: <User size={15} />, run: () => { p.onOpenProfile(); p.onClose(); } },
      { id: "export", label: "Export this chat as Markdown", icon: <Download size={15} />, run: () => { p.onExportActive(); p.onClose(); } },
    ];
    if (p.isAdmin) {
      base.push({ id: "admin", label: "Admin panel", icon: <Shield size={15} />, run: () => { p.onOpenAdmin(); p.onClose(); } });
    }
    return base;
  }, [p]);

  const chatActions = useMemo<Action[]>(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return p.sessions
      .filter((s) => s.title.toLowerCase().includes(needle))
      .slice(0, 8)
      .map((s) => ({
        id: `chat-${s.id}`,
        label: s.title || "Untitled chat",
        hint: `${s.messages.length} message${s.messages.length === 1 ? "" : "s"}`,
        icon: <MessageSquare size={15} />,
        run: () => { p.onSelectChat(s.id); p.onClose(); },
      }));
  }, [p.sessions, q]);

  const visible = q.trim()
    ? [...chatActions, ...actions.filter((a) => a.label.toLowerCase().includes(q.trim().toLowerCase()))]
    : actions;

  useEffect(() => { setSel(0); }, [q]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((v) => Math.min(v + 1, visible.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((v) => Math.max(v - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); visible[sel]?.run(); }
  }

  if (!p.open) return null;
  return (
    <Dialog.Root open onOpenChange={(o) => { if (!o) p.onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        <Dialog.Content className="modal cmd-palette" aria-label="Command palette" onKeyDown={onKeyDown}>
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Dialog.Description className="sr-only">Search chats and run commands</Dialog.Description>
          <div className="cmd-input">
            <Search size={15} aria-hidden="true" />
            <input
              ref={inputRef}
              autoFocus
              type="text"
              value={q}
              placeholder="Search chats or run a command…"
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search chats or run a command"
            />
          </div>
          <div className="cmd-list" role="listbox" aria-label="Results">
            {visible.length === 0 && <div className="cmd-empty">No matches</div>}
            {visible.map((a, i) => (
              <button
                key={a.id}
                role="option"
                aria-selected={i === sel}
                className={`cmd-item${i === sel ? " on" : ""}`}
                onMouseEnter={() => setSel(i)}
                onClick={a.run}
              >
                <span className="cmd-ico">{a.icon}</span>
                <span className="cmd-label">{a.label}</span>
                {a.hint && <span className="cmd-hint">{a.hint}</span>}
              </button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
