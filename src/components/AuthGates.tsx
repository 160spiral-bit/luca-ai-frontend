import Auth from "./Auth";
import { ProfileGate, UsernameGate } from "./Onboarding";
import { putUserData, setUsername } from "../lib/api";
import {
  confirmedUsername, loadToken, markUsernameConfirmed, saveAuthUser, saveProfile,
} from "../lib/store";
import type { AuthUser, Profile, Session, Settings, Tier } from "../lib/store";

// Auth/loading/onboarding gates extracted from App.tsx to keep it under budget.
// Renders `children` (the main app) when no gate fires.
export default function AuthGates(p: {
  authLoading: boolean;
  sessionsReady: boolean;
  authUser: AuthUser | null;
  guest: boolean;
  onboarding: string;
  sessions: Session[];
  activeId: string | null;
  settings: Settings;
  tier: Tier;
  profile: Profile | null;
  nameDraft: string;
  avatarDraft: string | null;
  onNameDraft: (v: string) => void;
  onAvatarDraft: (v: string | null) => void;
  onAuth: (token: string, user: AuthUser) => void;
  onGuest: () => void;
  onAuthUser: (u: AuthUser) => void;
  onProfile: (prof: Profile) => void;
  onSettingsTheme: (theme: Profile["theme"]) => void;
  onToast: (m: string) => void;
  children: React.ReactNode;
}) {
  const { authLoading, sessionsReady, authUser, guest, onboarding } = p;
  const usernameStale = !!authUser && !confirmedUsername(authUser.id)
    && (!authUser.username || /^(googleuser|githubuser|user\d*$)/i.test(authUser.username));
  const gatesPending = !!authUser && !guest && (usernameStale || !p.profile) && onboarding === "pending";

  if (authLoading || gatesPending || ((authUser || guest) && !sessionsReady)) {
    return <div className="center-page"><div className="spinner" /></div>;
  }
  if (!authUser && !guest) return <div className="center-page"><Auth onAuth={p.onAuth} onGuest={p.onGuest} /></div>;
  if (authUser && onboarding === "ready" && usernameStale) {
    const currentUser = authUser;
    return (
      <UsernameGate
        email={currentUser.email}
        draft={p.nameDraft}
        onDraft={p.onNameDraft}
        onSubmit={async () => {
          const token = loadToken();
          if (!token) return;
          try {
            const { error } = await setUsername(token, p.nameDraft.trim());
            if (error) throw new Error(error);
            markUsernameConfirmed(currentUser.id);
            saveAuthUser({ ...currentUser, username: p.nameDraft.trim() });
            p.onAuthUser({ ...currentUser, username: p.nameDraft.trim() });
            p.onToast("@" + p.nameDraft.trim() + " saved!");
          } catch (e) { p.onToast(e instanceof Error ? e.message : "Failed to save"); }
        }}
      />
    );
  }
  if (!p.profile && onboarding === "ready") {
    return (
      <ProfileGate
        nameDraft={p.nameDraft}
        avatarDraft={p.avatarDraft}
        onNameDraft={p.onNameDraft}
        onAvatarDraft={p.onAvatarDraft}
        onSubmit={() => {
          const prof: Profile = { name: p.nameDraft.trim() || "User", persona: null, theme: p.settings.theme, avatar: p.avatarDraft };
          p.onProfile(prof); saveProfile(prof);
          p.onSettingsTheme(prof.theme);
          p.onNameDraft("");
          p.onAvatarDraft(null);
          if (authUser && !guest) {
            const t = loadToken();
            if (t) void putUserData(t, { sessions: p.sessions, activeId: p.activeId, settings: p.settings, tier: p.tier, profile: prof });
          }
        }}
      />
    );
  }
  return <>{p.children}</>;
}
