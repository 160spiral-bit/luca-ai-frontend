import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import {
  clearAuth, defaultSettings, loadToken, mergeAdopted,
  saveActiveId, saveProfile, saveSessions, saveSettings, saveTier,
} from "../lib/store";
import type { AuthUser, Profile, Session, Settings, Tier } from "../lib/store";
import { getUserData, putUserData } from "../lib/api";

// Per-account cloud sync (REPLACE semantics) + onboarding resolution barrier.
// Extracted from App.tsx to keep the god component lean.
//
// REPLACE only ever runs on a genuine, successful read. A failed request must
// never mutate local state and must leave `hydrated` false so the POST below
// stays blocked — otherwise a 5xx wipes local chats and pushes empty state
// over the server record.
export function useCloudSync(opts: {
  authUser: AuthUser | null;
  guest: boolean;
  sessions: Session[];
  activeId: string | null;
  settings: Settings;
  tier: Tier;
  profile: Profile | null;
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  setTier: React.Dispatch<React.SetStateAction<Tier>>;
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
  setAuthUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
  setGuestState: React.Dispatch<React.SetStateAction<boolean>>;
  authUserRef: MutableRefObject<AuthUser | null>;
  themeRef: MutableRefObject<"dark" | "light">;
  storageFullToast: () => void;
  toast: (m: string) => void;
}) {
  const {
    authUser, guest, sessions, activeId, settings, tier, profile,
    setSessions, setActiveId, setSettings, setTier, setProfile,
    setAuthUser, setGuestState, authUserRef, themeRef,
    storageFullToast, toast,
  } = opts;

  const hydrated = useRef(false);
  const adoptRef = useRef<Session[] | null>(null);
  const hydrateGen = useRef(0);
  const resolveBarrier = useRef<{ verify: boolean | null; hydrate: boolean | null }>({ verify: null, hydrate: null });
  const [onboarding, setOnboarding] = useState<"pending" | "ready" | "deferred">("pending");

  // First settle wins per half (StrictMode double-invokes effects in dev).
  const settleOnboarding = useCallback((which: "verify" | "hydrate", ok: boolean) => {
    const b = resolveBarrier.current;
    if (which === "verify") { if (b.verify !== null) return; b.verify = ok; }
    else { if (b.hydrate !== null) return; b.hydrate = ok; }
    if (b.verify !== null && b.hydrate !== null) {
      setOnboarding(b.verify && b.hydrate ? "ready" : "deferred");
    }
  }, []);

  const resetOnboardingBarrier = useCallback(() => {
    resolveBarrier.current = { verify: null, hydrate: null };
    setOnboarding("pending");
  }, []);

  const syncFails = useRef(0);

  useEffect(() => {
    if (!authUser || guest) return;
    hydrated.current = false;
    const gen = ++hydrateGen.current;
    const myId = authUser.id;
    const token = loadToken();
    const giveUp = window.setTimeout(() => {
      if (gen === hydrateGen.current) settleOnboarding("hydrate", false);
    }, 10000);
    if (!token) { window.clearTimeout(giveUp); settleOnboarding("hydrate", false); return; }
    type Load =
      | { kind: "signed-out" }
      | { kind: "unavailable" }
      | { kind: "ok"; data: Record<string, unknown> | null };
    getUserData(token)
      .then((r): Load | Promise<Load> => {
        if (r.status === 401) { clearAuth(); setAuthUser(null); setGuestState(false); return { kind: "signed-out" }; }
        if (!r.ok) {
          console.warn("[Sync] Cloud load failed (" + r.status + ") — keeping local data");
          return { kind: "unavailable" };
        }
        return r.json()
          .then((body): Load => ({ kind: "ok", data: (body && typeof body.data === "object" ? body.data : null) }))
          .catch(() => { console.warn("[Sync] Cloud load returned unreadable body — keeping local data"); return { kind: "unavailable" }; });
      })
      .then((load) => {
        if (!load || load.kind !== "ok") { window.clearTimeout(giveUp); settleOnboarding("hydrate", false); return; }
        if (gen !== hydrateGen.current || myId !== authUserRef.current?.id) { window.clearTimeout(giveUp); return; }
        const d = load.data;
        if (d !== null && !Array.isArray((d as { sessions?: unknown }).sessions)) {
          console.warn("[Sync] Cloud record malformed — keeping local data");
          window.clearTimeout(giveUp); settleOnboarding("hydrate", false); return;
        }
        const srvSessions = d && Array.isArray(d.sessions) ? (d.sessions as Session[]) : [];
        const adopted = adoptRef.current || [];
        adoptRef.current = null;
        setSessions((prev) => {
          const merged = mergeAdopted(srvSessions, adopted, prev);
          void saveSessions(merged, storageFullToast);
          return merged;
        });
        const srvActive = typeof d?.activeId === "string" && srvSessions.some((s: Session) => s.id === d.activeId) ? d.activeId as string : null;
        setActiveId((prev) => {
          const next = prev || srvActive;
          saveActiveId(next);
          return next;
        });
        const srvSettings = { ...defaultSettings(), ...((d?.settings as object) || {}) };
        setSettings(srvSettings);
        saveSettings(srvSettings);
        const srvTier = d?.tier === "pro" ? "pro" : "flash";
        setTier(srvTier);
        saveTier(srvTier);
        if (d?.profile && typeof d.profile === "object") { setProfile(d.profile as Profile); saveProfile(d.profile as Profile); }
        else {
          const aName = (authUser.name || "").trim();
          const hasRealName = !!aName && aName !== "User" && !/^(googleuser|githubuser|user\d*)$/i.test(aName);
          if (hasRealName || authUser.avatar) {
            const fallback: Profile = { name: hasRealName ? aName : "User", persona: null, theme: themeRef.current, avatar: authUser.avatar || null };
            setProfile(fallback); saveProfile(fallback);
          } else { setProfile(null); }
        }
        hydrated.current = true;
        window.clearTimeout(giveUp); settleOnboarding("hydrate", true);
      })
      .catch(() => { window.clearTimeout(giveUp); settleOnboarding("hydrate", false); });
    return () => window.clearTimeout(giveUp);
  }, [authUser, guest, storageFullToast, settleOnboarding, setSessions, setActiveId, setSettings, setTier, setProfile, setAuthUser, setGuestState, authUserRef, themeRef]);

  useEffect(() => {
    if (!authUser || guest || !hydrated.current) return;
    const token = loadToken();
    if (!token) return;
    const t = window.setTimeout(() => {
      void putUserData(token, { sessions, activeId, settings, tier, profile }).then((r) => {
        if (r && r.ok) { syncFails.current = 0; return; }
        if (++syncFails.current === 3) toast("Chats aren't syncing to your account — check your connection.");
      });
    }, 900);
    return () => window.clearTimeout(t);
  }, [sessions, activeId, settings, tier, profile, authUser, guest, toast]);

  return { hydrated, adoptRef, hydrateGen, onboarding, setOnboarding, settleOnboarding, resetOnboardingBarrier };
}
