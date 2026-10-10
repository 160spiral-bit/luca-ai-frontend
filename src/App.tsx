import { useCallback, useEffect, useRef, useState } from "react";
import { toast as sonnerToast } from "sonner";
import { PanelLeft } from "lucide-react";
import Sidebar from "./components/Sidebar";
import AuthGates from "./components/AuthGates";
import AppMain from "./components/AppMain";
import AppPanels from "./components/AppPanels";
import { useNavigate } from "react-router-dom";
import { mintGuestSession, pingHealth, putUserData, refreshMe } from "./lib/api";
import {
  clearAuth, clearDeviceState, defaultSettings, isGuest,
  loadActiveId, loadArtifacts, loadAuthUser, loadProfile, loadSessions,
  loadSettings, loadTier, loadToken,
  saveActiveId, saveArtifacts, saveAuthUser, saveProfile, saveSessions, saveSettings,
  saveTier, saveToken, setGuest, uid,
} from "./lib/store";
import type { Artifact, AuthUser, Profile, Session, Settings, Tier } from "./lib/store";
import { useStreams } from "./hooks/useStreams";
import { useCloudSync } from "./hooks/useCloudSync";
import { useGreeting } from "./hooks/useGreeting";
import { useChatActions } from "./hooks/useChatActions";
import { useAuthBootstrap } from "./hooks/useAuthBootstrap";
import { useHeroFlip } from "./hooks/useHeroFlip";
import { useLayoutDebug } from "./hooks/useLayoutDebug";

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(() => loadProfile());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsReady, setSessionsReady] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(() => loadActiveId());
  const [tier, setTier] = useState<Tier>(() => loadTier());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [panel, setPanel] = useState<"settings" | "profile" | "admin" | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [artifacts, setArtifacts] = useState<Record<string, Artifact>>({});
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => loadAuthUser());
  const [authLoading, setAuthLoading] = useState(true);
  const [guest, setGuestState] = useState(() => isGuest());
  const [nameDraft, setNameDraft] = useState("");
  const [avatarDraft, setAvatarDraft] = useState<string | null>(null);
  const [composerDraft, setComposerDraft] = useState<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  // Live mirrors for async callbacks that outlive their closure.
  const sessionsRef = useRef(sessions);
  const activeIdRef = useRef(activeId);
  const themeRef = useRef(settings.theme);
  const authUserRef = useRef(authUser);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { themeRef.current = settings.theme; }, [settings.theme]);
  useEffect(() => { authUserRef.current = authUser; }, [authUser]);
  // iOS keyboard: 100dvh tracks browser chrome, NOT the software keyboard, so
  // without this the composer slides under the keyboard on focus.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const set = () => document.documentElement.style.setProperty("--vvh", `${vv.height}px`);
    set();
    vv.addEventListener("resize", set);
    vv.addEventListener("scroll", set);
    return () => { vv.removeEventListener("resize", set); vv.removeEventListener("scroll", set); };
  }, []);

  const toast = useCallback((text: string) => {
    sonnerToast(text, { duration: 2400 });
  }, []);
  const storageFullToast = useCallback(() => {
    toast("Couldn't save chats — storage is full. Delete old chats to free space.");
  }, [toast]);
  const { streams, setStreams, streamsRef, aborts, stopChat, stopAllChats } = useStreams(activeIdRef);
  const { hydrated, adoptRef, onboarding, setOnboarding, settleOnboarding, resetOnboardingBarrier } = useCloudSync({
    authUser, guest, sessions, activeId, settings, tier, profile,
    setSessions, setActiveId, setSettings, setTier, setProfile,
    setAuthUser, setGuestState, authUserRef, themeRef,
    storageFullToast, toast,
  });
  // Auth bootstrap + wipe (extracted hook).
  const { wipeClientState } = useAuthBootstrap({
    setSessions, setActiveId, setSettings, setTier, setProfile,
    setAuthUser, setGuestState, setAuthLoading, setNameDraft, setAvatarDraft,
    setPanel, setSearch, stopAllChats, hydrated, resetOnboardingBarrier,
    settleOnboarding, setOnboarding, toast,
  });
  // Send / regenerate / edit flows (extracted hook).
  const { sendMessage, regenerate, editAndResend, setVersion, setChatTier } = useChatActions({
    sessionsRef, activeIdRef, streamsRef, aborts, setStreams,
    setSessions, setActiveId, setArtifacts, setActiveArtifactId,
    tier, settings, profile, authUser, toast,
  });

  const activeSession = sessions.find((s) => s.id === activeId) || null;
  const streamingActive = !!activeId && !!streams[activeId];
  const isEmpty = !activeSession || activeSession.messages.length === 0;
  const { sendFromHero } = useHeroFlip(isEmpty, sendMessage);
  useLayoutDebug(authUser, guest);
  useEffect(() => {
    let dead = false;
    void loadSessions().then((list) => {
      if (dead) return;
      if (hydrated.current) {
        setSessions((prev) => {
          const seen = new Set(prev.map((s) => s.id));
          const extra = list.filter((s) => s && !seen.has(s.id));
          return extra.length ? [...prev, ...extra] : prev;
        });
      } else {
        setSessions(list);
      }
      const id = loadActiveId();
      setActiveId(id && list.some((s) => s.id === id) ? id : null);
      setSessionsReady(true);
    });
    return () => { dead = true; };
  }, [hydrated]);
  useEffect(() => {
    document.body.classList.toggle("no-times", !settings.showTimestamps);
  }, [settings.showTimestamps]);
  useEffect(() => {
    document.title = activeSession ? `${activeSession.title} — Luca` : "Luca AI";
  }, [activeSession?.title]);

  useEffect(() => {
    if (document.hidden) return;
    const ping = () => { if (!document.hidden) void pingHealth(); };
    ping();
    const id = window.setInterval(ping, 60000);
    return () => window.clearInterval(id);
  }, []);

  // Artifacts persist in IndexedDB alongside sessions.
  useEffect(() => {
    let dead = false;
    void loadArtifacts().then((a) => { if (!dead) setArtifacts(a); });
    return () => { dead = true; };
  }, []);
  useEffect(() => {
    if (Object.keys(artifacts).length === 0) return;
    const t = window.setTimeout(() => { void saveArtifacts(artifacts, storageFullToast); }, 500);
    return () => window.clearTimeout(t);
  }, [artifacts, storageFullToast]);
  const openArtifact = useCallback((id: string) => { setActiveArtifactId(id); setMobileNav(false); }, []);
  const previewHtml = useCallback((title: string, html: string) => {
    const id = uid();
    setArtifacts((prev) => ({
      ...prev,
      [id]: { id, artifactType: "html", title: title || "HTML preview", versions: [{ version: 1, content: html, createdAt: new Date().toISOString() }] },
    }));
    setMobileNav(false);
    setActiveArtifactId(id);
  }, []);
  const clearAllChats = useCallback(() => {
    stopAllChats();
    setSessions([]);
    setActiveId(null);
    void saveSessions([], storageFullToast);
    const t = loadToken();
    if (authUser && t) void putUserData(t, { sessions: [], activeId: null, settings, tier, profile });
    toast("All chats cleared");
  }, [authUser, settings, tier, profile, toast, storageFullToast, stopAllChats]);
  useEffect(() => {
    if (!sessionsReady) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveSessions(sessions, storageFullToast);
    }, 350);
    return () => window.clearTimeout(saveTimer.current);
  }, [sessions, sessionsReady, storageFullToast]);
  useEffect(() => saveActiveId(activeId), [activeId]);
  useEffect(() => saveTier(tier), [tier]);
  useEffect(() => {
    saveSettings(settings);
    document.documentElement.setAttribute("data-theme", settings.theme);
  }, [settings]);

  const switchChat = useCallback((id: string | null) => {
    setActiveId(id);
    setSearch("");
    setMobileNav(false);
    setActiveArtifactId(null);
  }, []);
  const handleAuth = useCallback((token: string, user: AuthUser) => {
    adoptRef.current = isGuest() ? [...sessionsRef.current] : null;
    wipeClientState();
    setGuest(false); setGuestState(false);
    saveToken(token); saveAuthUser(user);
    setAuthUser(user);
    settleOnboarding("verify", true);
    toast("Welcome, " + user.name);
  }, [toast, wipeClientState, settleOnboarding, adoptRef, sessionsRef]);
  const handleGuest = useCallback(() => {
    setGuest(true); setGuestState(true); setAuthLoading(false);
    setOnboarding("ready");
    void mintGuestSession();
    toast("You're browsing as a guest — chats stay on this device");
  }, [toast, setOnboarding]);
  const navigate = useNavigate();
  const logout = useCallback(() => {
    wipeClientState();
    clearAuth(); setGuest(false); setGuestState(false);
    setAuthUser(null);
    toast("Logged out");
    window.setTimeout(() => navigate("/"), 250);
  }, [toast, wipeClientState, navigate]);
  const resetEverything = useCallback(() => {
    stopAllChats();
    window.clearTimeout(saveTimer.current);
    clearDeviceState(); clearAuth(); setGuest(false); setGuestState(false);
    setAuthUser(null); setSessions([]); setActiveId(null); setPanel(null);
    const fresh = defaultSettings();
    setSettings(fresh);
    document.documentElement.setAttribute("data-theme", fresh.theme);
    setTier("flash"); setProfile(null);
    window.setTimeout(() => navigate("/"), 200);
  }, [navigate, stopAllChats]);
  const refreshSelf = useCallback(() => {
    refreshMe().then((u) => { if (u) { saveAuthUser(u); setAuthUser(u); } }).catch(() => { /* stay with cached user */ });
  }, []);
  const handleEditDraft = useCallback((text: string) => {
    setComposerDraft(text);
  }, []);
  const { heroGreeting, sendSuggestion } = useGreeting({
    sessions,
    profileName: profile?.name,
    authName: authUser?.name,
    sendMessage,
  });

  return (
    <AuthGates authLoading={authLoading} sessionsReady={sessionsReady}
      authUser={authUser} guest={guest} onboarding={onboarding}
      sessions={sessions} activeId={activeId} settings={settings} tier={tier} profile={profile}
      nameDraft={nameDraft} avatarDraft={avatarDraft} onNameDraft={setNameDraft} onAvatarDraft={setAvatarDraft}
      onAuth={handleAuth} onGuest={handleGuest} onAuthUser={setAuthUser}
      onProfile={setProfile} onSettingsTheme={(t) => setSettings((s) => ({ ...s, theme: t }))} onToast={toast}>
      <div className={`app${collapsed ? " collapsed" : ""}`}>
        <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); const el = document.getElementById("main"); el?.setAttribute("tabindex", "-1"); el?.focus({ preventScroll: false }); }}>Skip to chat</a>
        <button className="open-sidebar" onClick={() => setCollapsed(false)} aria-label="Open sidebar" title="Open sidebar">
          <PanelLeft size={16} />
        </button>
        <Sidebar
          sessions={sessions} activeId={activeId} search={search} onSearch={setSearch}
          onSelect={(id) => switchChat(id)} onNew={() => switchChat(null)}
          onRename={(id, t) => setSessions((p) => p.map((s) => (s.id === id ? { ...s, title: t, userNamed: true } : s)))}
          onTogglePin={(id) => setSessions((p) => p.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)))}
          onDelete={(id) => {
            stopChat(id);
            setSessions((p) => p.filter((s) => s.id !== id));
            if (activeId === id) setActiveId(null);
            toast("Chat successfully deleted");
          }}
          onOpenSettings={() => setPanel("settings")} onOpenProfile={() => setPanel("profile")}
          onClearAll={clearAllChats} onLogout={logout}
          isAdmin={authUser?.isAdmin} onOpenAdmin={() => setPanel("admin")}
          authUser={authUser} profile={profile} mobileOpen={mobileNav} onCloseMobile={() => setMobileNav(false)}
          collapsed={collapsed} onToggleSidebar={() => setCollapsed((v) => !v)}
        />
        <AppMain isEmpty={isEmpty} greetingHead={heroGreeting.head} greetingSub={heroGreeting.sub}
          title={activeSession ? activeSession.title : "New chat"}
          streamingActive={streamingActive} sendFromHero={sendFromHero} sendMessage={sendMessage} onStop={() => stopChat()}
          tier={tier} activeTier={activeSession?.tier || tier}
          onTierChange={(t) => setTier(t)}
          onChatTierChange={(t) => { if (activeSession) setChatTier(activeSession.id, t); else setTier(t); }}
          settings={settings} onToast={toast} composerDraft={composerDraft} onPrefillConsumed={() => setComposerDraft(null)}
          session={activeSession} onSuggestion={sendSuggestion} onRegenerate={regenerate}
          onEditResend={editAndResend} onVersion={setVersion} onEditDraft={handleEditDraft}
          onOpenArtifact={openArtifact} onPreviewHtml={previewHtml} onOpenMobile={() => setMobileNav(true)} />
        <AppPanels panel={panel} settings={settings}
          onSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))} onReset={resetEverything} onClosePanel={() => setPanel(null)}
          profile={profile} authUser={authUser}
          onSaveProfile={(patch) => setProfile((prev) => { const next = { ...(prev || { name: "", persona: null, theme: settings.theme, avatar: null }), ...patch }; saveProfile(next); return next; })}
          onLogout={logout} onToast={toast} token={loadToken() || ""} onRefreshSelf={refreshSelf}
          activeArtifactId={activeArtifactId} artifacts={artifacts} onCloseArtifact={() => setActiveArtifactId(null)} />
      </div>
    </AuthGates>
  );
}
