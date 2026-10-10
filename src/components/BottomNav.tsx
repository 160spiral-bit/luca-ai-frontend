import { NavLink, useNavigate } from "react-router-dom";
import { MessageSquarePlus, Settings, User } from "lucide-react";

export default function BottomNav(p: {
  onNewChat: () => void;
  onOpenSettings: () => void;
  onOpenProfile: () => void;
  onOpenSidebar: () => void;
}) {
  const nav = useNavigate();
  const item = "bn-item";
  return (
    <nav className="bottom-nav app-only-mobile" aria-label="Primary">
      <NavLink to="/" end className={({ isActive }) => `${item}${isActive ? " on" : ""}`}>
        <MessageSquarePlus size={19} aria-hidden="true" />
        <span>New</span>
      </NavLink>
      <button className={`${item}`} onClick={p.onOpenSidebar} aria-label="Chats">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        <span>Chats</span>
      </button>
      <button
        className="bn-fab"
        aria-label="New chat"
        onClick={() => { p.onNewChat(); nav("/chat"); }}
      >
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>
      <button className={item} onClick={p.onOpenSettings} aria-label="Settings">
        <Settings size={19} aria-hidden="true" />
        <span>Settings</span>
      </button>
      <button className={item} onClick={p.onOpenProfile} aria-label="Profile">
        <User size={19} aria-hidden="true" />
        <span>You</span>
      </button>
    </nav>
  );
}
