import { useCallback, useEffect } from "react";
import type { MutableRefObject } from "react";
import { isGuest, clearAuth, clearDeviceState, defaultSettings, loadAuthUser, loadToken, saveAuthUser, saveToken } from "../lib/store";
import type { AuthUser, Profile, Session, Settings, Tier } from "../lib/store";
import { mintGuestSession, verifySession, verifyToken } from "../lib/api";

// Auth bootstrap: oauth callback, then cached session. Extracted from App.tsx
// god component. Wipe helper lives here too so sign-out and fresh sign-in
// share one clean-slate path.
export function useAuthBootstrap(opts: {
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  setTier: React.Dispatch<React.SetStateAction<Tier>>;
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
  setAuthUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
  setGuestState: React.Dispatch<React.SetStateAction<boolean>>;
  setAuthLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setNameDraft: React.Dispatch<React.SetStateAction<string>>;
  setAvatarDraft: React.Dispatch<React.SetStateAction<string | null>>;
  setPanel: React.Dispatch<React.SetStateAction<"settings" | "profile" | "admin" | null>>;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  stopAllChats: () => void;
  hydrated: MutableRefObject<boolean>;
  resetOnboardingBarrier: () => void;
  settleOnboarding: (which: "verify" | "hydrate", ok: boolean) => void;
  setOnboarding: React.Dispatch<React.SetStateAction<"pending" | "ready" | "deferred">>;
  toast: (m: string) => void;
}) {
  const {
    setSessions,
    setActiveId,
    setSettings,
    setTier,
    setProfile,
    setAuthUser,
    setGuestState,
    setAuthLoading,
    setNameDraft,
    setAvatarDraft,
    setPanel,
    setSearch,
    stopAllChats,
    hydrated,
    resetOnboardingBarrier,
    settleOnboarding,
    setOnboarding,
    toast,
  } = opts;

  // Wipe every client slice (storage + memory) so the next session starts
  // clean. Called on sign-out AND before hydrating a new sign-in.
  const wipeClientState = useCallback(() => {
    stopAllChats();
    clearDeviceState();
    setSessions([]);
    setActiveId(null);
    const fresh = defaultSettings();
    setSettings(fresh);
    document.documentElement.setAttribute("data-theme", fresh.theme);
    setTier("flash");
    setProfile(null);
    setNameDraft("");
    setAvatarDraft(null);
    setPanel(null);
    setSearch("");
    hydrated.current = false;
    resetOnboardingBarrier();
  }, [stopAllChats, resetOnboardingBarrier, hydrated, setSessions, setActiveId, setSettings, setTier, setProfile, setNameDraft, setAvatarDraft, setPanel, setSearch]);

  // Auth bootstrap: oauth callback, then cached session.
  useEffect(() => {
    if (isGuest()) {
      setGuestState(true);
      setAuthLoading(false);
      setOnboarding("ready");
      void mintGuestSession();
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const token = params.get("auth_token");
    const err = params.get("auth_error");
    if (err) {
      toast("Authentication failed: " + err);
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (token) {
      const name = params.get("auth_name") ? decodeURIComponent(params.get("auth_name")!) : "";
      const username = params.get("auth_username") ? decodeURIComponent(params.get("auth_username")!) : "";
      verifyToken(token)
        .then((user) => {
          const u = user || { id: "oauth", email: "", name: name || "User", username: username || "user", provider: "oauth", avatar: null };
          wipeClientState();
          saveToken(token);
          saveAuthUser(u);
          setAuthUser(u);
          window.history.replaceState({}, "", window.location.pathname);
          setAuthLoading(false);
          settleOnboarding("verify", true);
        })
        .catch(() => {
          const cached = loadAuthUser() || { id: "oauth", email: "", name: name || "User", username: username || "user", provider: "oauth", avatar: null };
          saveToken(token);
          saveAuthUser(cached);
          setAuthUser(cached);
          window.history.replaceState({}, "", window.location.pathname);
          setAuthLoading(false);
          settleOnboarding("verify", false);
        });
      return;
    }
    const saved = loadToken();
    if (!saved) {
      setAuthLoading(false);
      settleOnboarding("verify", true);
      return;
    }
    const cached = loadAuthUser();
    if (cached) {
      setAuthUser(cached);
      setAuthLoading(false);
      verifySession(saved)
        .then((r) => {
          if (r.status === 401) {
            wipeClientState();
            clearAuth();
            setAuthUser(null);
            return null;
          }
          return r.ok ? r.json() : null;
        })
        .then((j) => {
          if (j?.user) {
            saveAuthUser(j.user);
            setAuthUser(j.user);
            settleOnboarding("verify", true);
          } else settleOnboarding("verify", false);
        })
        .catch(() => {
          settleOnboarding("verify", false);
        });
      return;
    }
    verifyToken(saved)
      .then((user) => {
        if (user) {
          saveAuthUser(user);
          setAuthUser(user);
        } else {
          clearAuth();
          setAuthUser(null);
        }
        setAuthLoading(false);
        settleOnboarding("verify", true);
      })
      .catch(() => {
        settleOnboarding("verify", false);
        setAuthLoading(false);
      });
  }, [toast, wipeClientState, settleOnboarding, setAuthUser, setGuestState, setAuthLoading, setOnboarding]);

  return { wipeClientState };
}
