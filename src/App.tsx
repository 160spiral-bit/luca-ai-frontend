import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Menu, PanelLeft } from "lucide-react";
import Sidebar from "./components/Sidebar";
import ChatArea from "./components/ChatArea";
import Composer from "./components/Composer";
import Auth from "./components/Auth";
const ArtifactPanel = lazy(() => import("./components/ArtifactPanel"));
import { AdminPanel, ProfilePanel, SettingsPanel } from "./components/Panels";
import { barbaGo } from "./barba";
import {
  followups, getUserData, nameChatFromMessages, pingHealth, putUserData,
  refreshMe, setUsername, streamChat, verifySession, verifyToken,
} from "./lib/api";
import type { ChatMsg, EngineEvent } from "./lib/api";
import {
  clearAuth, clearDeviceState, confirmedUsername, defaultSettings, downscaleImage, isGuest,
  loadActiveId, loadAuthUser, loadProfile, loadSessions,
  loadSettings, loadTier, loadToken, markUsernameConfirmed,
  saveActiveId, saveAuthUser, saveProfile, saveSessions, saveSettings,
  saveTier, saveToken, setGuest, titleFromMessage, uid,
} from "./lib/store";
import type { Artifact, Attachment, AuthUser, LucaMessage, Profile, Session, Settings, Tier, ToolRound } from "./lib/store";

// Inline document/code attachments as text blocks so the model actually
// receives them. Images travel as image_url parts; everything else must be
// text here or it is silently dropped.
function docBlockFor(atts?: Attachment[]): string {
  const docs = (atts || []).filter((a) => !a.type.startsWith("image/"));
  if (!docs.length) return "";
  return docs.map((a) => a.text
    ? `[Attached file: ${a.name}]\n${a.text}`
    : `[Attached file: ${a.name}] (could not extract text from this file type — contents not included)`).join("\n\n");
}



export default function App({ namespace }: { namespace: string }) {
  const [profile, setProfile] = useState<Profile | null>(() => loadProfile());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsReady, setSessionsReady] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(() => loadActiveId());
  // Sessions hydrate async from IndexedDB (Phase 2). Nothing saves until ready.
  useEffect(() => {
    let dead = false;
    void loadSessions().then((list) => {
      if (dead) return;
      setSessions(list);
      const id = loadActiveId();
      setActiveId(id && list.some((s) => s.id === id) ? id : null);
      setSessionsReady(true);
    });
    return () => { dead = true; };
  }, []);
  const [tier, setTier] = useState<Tier>(() => loadTier());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [streaming, setStreaming] = useState<{ sessionId: string; msgUid: string } | null>(null);
  const [toasts, setToasts] = useState<{ id: string; text: string }[]>([]);
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
  const abortRef = useRef<AbortController | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  const activeSession = sessions.find((s) => s.id === activeId) || null;
  const isStreaming = streaming !== null;
  // FIX 2a: generation state is scoped to its session. The composer only
  // shows "stop" when the running stream belongs to the open chat.
  const streamingActive = !!streaming && streaming.sessionId === activeId;
  // Live mirrors for async callbacks (follow-ups) that outlive their closure.
  const sessionsRef = useRef(sessions);
  const activeIdRef = useRef(activeId);
  const themeRef = useRef(settings.theme);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { themeRef.current = settings.theme; }, [settings.theme]);

  const toast = useCallback((text: string) => {
    const id = uid();
    setToasts((p) => [...p.slice(-2), { id, text }]);
    window.setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 2400);
  }, []);
  // Wipe every client slice (storage + memory) so the next session starts
  // clean. Called on sign-out AND before hydrating a new sign-in. Defined
  // above the bootstrap effect so the dep array is honest.
  const wipeClientState = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(null);
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
  }, []);

  useEffect(() => {
    const ping = () => { void pingHealth(); };
    ping();
    const id = window.setInterval(ping, 60000);
    return () => window.clearInterval(id);
  }, []);

  // auth bootstrap: oauth callback, then cached session
  useEffect(() => {
    if (isGuest()) { setGuestState(true); setAuthLoading(false); return; }
    const params = new URLSearchParams(window.location.search);
    const token = params.get("auth_token");
    const err = params.get("auth_error");
    if (err) { toast("Authentication failed: " + err); window.history.replaceState({}, "", window.location.pathname); }
    if (token) {
      const name = params.get("auth_name") ? decodeURIComponent(params.get("auth_name")!) : "";
      const username = params.get("auth_username") ? decodeURIComponent(params.get("auth_username")!) : "";
      verifyToken(token).then((user) => {
        const u = user || { id: "oauth", email: "", name: name || "User", username: username || "user", provider: "oauth", avatar: null };
        wipeClientState();
        saveToken(token); saveAuthUser(u); setAuthUser(u);
        window.history.replaceState({}, "", window.location.pathname);
        setAuthLoading(false);
      }).catch(() => {
        const cached = loadAuthUser() || { id: "oauth", email: "", name: name || "User", username: username || "user", provider: "oauth", avatar: null };
        saveToken(token); saveAuthUser(cached); setAuthUser(cached);
        window.history.replaceState({}, "", window.location.pathname);
        setAuthLoading(false);
      });
      return;
    }
    const saved = loadToken();
    if (!saved) { setAuthLoading(false); return; }
    const cached = loadAuthUser();
    if (cached) {
      setAuthUser(cached);
      setAuthLoading(false);
      verifySession(saved)
        .then((r) => {
          if (r.status === 401) { wipeClientState(); clearAuth(); setAuthUser(null); return null; }
          return r.ok ? r.json() : null;
        })
        .then((j) => { if (j?.user) { saveAuthUser(j.user); setAuthUser(j.user); } })
        .catch(() => {});
      return;
    }
    verifyToken(saved).then((user) => {
      if (user) { saveAuthUser(user); setAuthUser(user); }
      else { clearAuth(); setAuthUser(null); }
      setAuthLoading(false);
    }).catch(() => setAuthLoading(false));
  }, [toast, wipeClientState]);

  const storageFullToast = useCallback(() => {
    toast("Couldn't save chats — storage is full. Delete old chats to free space.");
  }, [toast]);
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

  // per-account cloud sync — REPLACE semantics. Server data for the current
  // user overwrites every slice; nothing is merged, so a previous account's
  // chats/settings/tier/profile can never leak into this one.
  const hydrated = useRef(false);
  const adoptRef = useRef<Session[] | null>(null);
  useEffect(() => {
    if (!authUser || guest) return;
    const myId = authUser.id;
    const token = loadToken();
    if (!token) return;
    getUserData(token)
      .then((r) => {
        if (r.status === 401) { clearAuth(); setAuthUser(null); setGuestState(false); return null; }
        return r.ok ? r.json() : null;
      })
      .then((j) => {
        if (myId !== authUser.id) return; // account changed mid-flight — discard
        const d = j?.data || {};
        const srvSessions = Array.isArray(d.sessions) ? d.sessions : [];
        // Adopt pre-login guest work only into an EMPTY server record, and
        // merge messages sent during the hydration window. Never another
        // account's data: post-wipe local state can only be this user's own.
        const adopted = adoptRef.current || [];
        adoptRef.current = null;
        setSessions((prev) => {
          const localOnly = [...adopted, ...prev].filter((l) => !srvSessions.some((s: Session) => s.id === l.id));
          const merged = [...srvSessions, ...localOnly];
          void saveSessions(merged, storageFullToast);
          return merged;
        });
        const srvActive = typeof d.activeId === "string" && srvSessions.some((s: Session) => s.id === d.activeId) ? d.activeId : null;
        setActiveId((prev) => {
          const next = prev || srvActive;
          saveActiveId(next);
          return next;
        });
        const srvSettings = { ...defaultSettings(), ...(d.settings || {}) };
        setSettings(srvSettings);
        saveSettings(srvSettings);
        const srvTier = d.tier === "pro" ? "pro" : "flash";
        setTier(srvTier);
        saveTier(srvTier);
        // Server profile presence = onboarding completed for THIS user.
        // Absent → fall back to the account's own name/avatar (OAuth already
        // has both) so the gate never re-asks for what exists; only a truly
        // blank account sees the name prompt.
        if (d.profile && typeof d.profile === "object") { setProfile(d.profile); saveProfile(d.profile); }
        else {
          const aName = (authUser.name || "").trim();
          const hasRealName = !!aName && aName !== "User" && !/^(googleuser|githubuser|user\d*)$/i.test(aName);
          if (hasRealName || authUser.avatar) {
            const adopted = { name: hasRealName ? aName : "User", persona: null, theme: themeRef.current, avatar: authUser.avatar || null };
            setProfile(adopted); saveProfile(adopted);
          } else { setProfile(null); }
        }
        hydrated.current = true;
      })
      .catch(() => { /* stay unhydrated: never POST wiped state over server data */ });
  }, [authUser, guest, storageFullToast]);
  useEffect(() => {
    if (!authUser || guest || !hydrated.current) return;
    const token = loadToken();
    if (!token) return;
    const t = window.setTimeout(() => {
      void putUserData(token, { sessions, activeId, settings, tier, profile });
    }, 900);
    return () => window.clearTimeout(t);
  }, [sessions, activeId, settings, tier, profile, authUser, guest]);

  const patchMsg = useCallback((sid: string, mu: string, patch: Partial<LucaMessage>) => {
    setSessions((prev) => prev.map((s) => s.id === sid
      ? { ...s, updatedAt: Date.now(), messages: s.messages.map((m) => (m.uid === mu ? { ...m, ...patch } : m)) }
      : s));
  }, []);
  const patchRound = useCallback((sid: string, mu: string, rid: string, patch: Partial<ToolRound>) => {
    setSessions((prev) => prev.map((s) => s.id === sid ? {
      ...s, updatedAt: Date.now(),
      messages: s.messages.map((m) => {
        if (m.uid !== mu) return m;
        const rounds = m.toolRounds || [];
        return { ...m, toolRounds: rounds.some((r) => r.id === rid) ? rounds.map((r) => (r.id === rid ? { ...r, ...patch } : r)) : [...rounds, { id: rid, name: "web_search", query: "", sources: [], status: "running" as const, ...patch }] };
      }),
    } : s));
  }, []);
  const commitVersion = useCallback((sid: string, mu: string, text: string) => {
    if (!text.trim()) return;
    setSessions((prev) => prev.map((s) => s.id !== sid ? s : {
      ...s, messages: s.messages.map((m) => {
        if (m.uid !== mu) return m;
        const versions = [...(m.versions || [])];
        if (!versions.length || versions[versions.length - 1] !== text) versions.push(text);
        return { ...m, versions, versionIndex: versions.length - 1 };
      }),
    }));
  }, []);

  const runStream = useCallback(async (sid: string, auid: string, history: ChatMsg[], userText: string, t: Tier) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming({ sessionId: sid, msgUid: auid });
    let acc = "", reasoning = "";
    const startedAt = Date.now();
    let firstContentAt: number | null = null;
    try {
      const gen = streamChat({ tier: t, history, settings, profile, auth: authUser, signal: controller.signal });
      for await (const ev of gen as AsyncGenerator<EngineEvent>) {
        switch (ev.kind) {
          case "reset": reasoning = ""; patchMsg(sid, auid, { reasoning: "" }); break;
          case "meta": patchMsg(sid, auid, { modelMeta: { model: ev.model, provider: ev.provider, pinned: ev.pinned } }); break;
          case "reasoning": reasoning += ev.text; patchMsg(sid, auid, { reasoning }); break;
          case "stage": patchMsg(sid, auid, { stage: ev.stage, stageLabel: ev.label }); break;
          case "sources": patchMsg(sid, auid, { sources: ev.sources }); break;
          case "search-info": patchMsg(sid, auid, { searchInfo: { query: ev.query, reason: ev.reason, count: ev.count } }); break;
          case "content":
            if (!firstContentAt) firstContentAt = Date.now();
            acc += ev.text;
            patchMsg(sid, auid, { content: acc });
            break;
          case "tool-start": patchRound(sid, auid, ev.roundId, { name: ev.name, query: ev.query, status: "running" }); break;
          case "tool-end": patchRound(sid, auid, ev.roundId, { sources: ev.sources, status: "done", ms: ev.ms }); break;
          case "error": patchMsg(sid, auid, { error: ev.message }); break;
          case "artifact_start": {
            setArtifacts((prev) => {
              const ex = prev[ev.id];
              if (ex) return { ...prev, [ev.id]: { ...ex, versions: [...ex.versions, { version: ex.versions.length + 1, content: "", createdAt: new Date().toISOString() }] } };
              return { ...prev, [ev.id]: { id: ev.id, artifactType: ev.artifactType as Artifact["artifactType"], title: ev.title, versions: [{ version: 1, content: "", createdAt: new Date().toISOString() }] } };
            });
            setActiveArtifactId(ev.id);
            break;
          }
          case "artifact_delta": {
            setArtifacts((prev) => {
              const art = prev[ev.id];
              if (!art) return prev;
              const versions = [...art.versions];
              const last = versions[versions.length - 1];
              if (!last) return prev;
              versions[versions.length - 1] = { ...last, content: last.content + ev.chunk };
              return { ...prev, [ev.id]: { ...art, versions } };
            });
            break;
          }
          case "artifact_end": break;
          case "done": break;
        }
      }
      patchMsg(sid, auid, { streaming: false, thinkingMs: reasoning ? (firstContentAt || Date.now()) - startedAt : undefined });
      commitVersion(sid, auid, acc);
      // Follow-up chips: only for clean completions with substance. Applied
      // only if this message is still the latest (conversation didn't move on).
      if (acc.trim().length > 40 && !controller.signal.aborted) {
        void followups(acc).then((sugs) => {
          if (!sugs.length || controller.signal.aborted) return;
          const cur = sessionsRef.current.find((s) => s.id === sid);
          const last = cur?.messages[cur.messages.length - 1];
          if (!last || last.uid !== auid || last.role !== "assistant") return;
          if (activeIdRef.current !== sid) return;
          patchMsg(sid, auid, { followups: sugs });
        });
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        patchMsg(sid, auid, { streaming: false, interrupted: true });
        commitVersion(sid, auid, acc);
      } else {
        const stalled = e instanceof DOMException && e.name === "TimeoutError";
        const raw = e instanceof Error ? e.message : "Something went wrong.";
        patchMsg(sid, auid, {
          streaming: false,
          error: stalled
            ? "Stream stalled — the backend stopped responding. Hit Retry to continue."
            : /failed to fetch|networkerror|load failed|typeerror/i.test(raw) ? "Backend not reachable — try again in a moment." : raw,
        });
        commitVersion(sid, auid, acc);
      }
    } finally {
      setStreaming(null);
      abortRef.current = null;
      // External background agent: premise-established naming, uses LATEST sent message, not first.
      // Fire-and-forget so it never blocks the chat turn.
      void (async () => {
        try {
          if (!acc || acc.trim().length < 15) return;
          const cur = sessionsRef.current.find((s) => s.id === sid);
          if (!cur) return;
          const isDefault = cur.title === "New chat";
          const lastUserMsg = [...cur.messages].reverse().find((m) => m.role === "user");
          const lastUserText = lastUserMsg ? lastUserMsg.content.trim() : userText;
          const substantive = lastUserText.length > 12 && !/^(hi|hello|hey|hola|howdy|yo)[\s!.?]*$/i.test(lastUserText);
          // If premise not yet established (greeting only), defer naming to next turn
          if (isDefault && !substantive && cur.messages.length <= 2) return;
          // Build history from latest messages (premise in latest, not first)
          const hist: ChatMsg[] = cur.messages
            .filter((m) => (m.role === "user" ? m.content : m.content || m.toolRounds?.length))
            .slice(-6)
            .map((m) => ({ role: m.role, content: m.content }));
          if (hist.length === 0) hist.push({ role: "user", content: userText }, { role: "assistant", content: acc.slice(0, 500) });
          const title = (await nameChatFromMessages(hist)) || titleFromMessage(lastUserText);
          if (title) setSessions((p) => p.map((x) => (x.id === sid ? { ...x, title } : x)));
        } catch { /* background naming must never break the chat turn */ }
      })();
    }
  }, [settings, profile, authUser, patchMsg, patchRound, commitVersion]);

  const toHistory = (msgs: LucaMessage[]): ChatMsg[] =>
    msgs.filter((m) => (m.role === "user" ? m.content : m.content || m.toolRounds?.length))
      .map((m, i, arr) => {
        if (m.role !== "user") return { role: m.role, content: m.content };
        const docs = docBlockFor(m.attachments);
        const text = m.content + (m.attachments?.length ? "\n[Attached: " + m.attachments.map((a) => a.name).join(", ") + "]" : "") + (docs ? "\n\n" + docs : "");
        const imgs = (m.attachments || []).filter((a) => a.type.startsWith("image/"));
        if (imgs.length && i >= arr.length - 3) {
          return { role: "user", content: [{ type: "text", text }, ...imgs.map((a) => ({ type: "image_url", image_url: { url: a.dataUrl } }))] };
        }
        return { role: "user", content: text };
      });

  const sendMessage = useCallback((text: string, attachments: Attachment[]) => {
    if (streamingRef.current) return;
    let sid = activeIdRef.current;
    let baseMsgs: LucaMessage[] = [];
    const liveSession = sid ? sessionsRef.current.find((s) => s.id === sid) || null : null;
    if (!sid || !liveSession) {
      sid = uid();
      setSessions((p) => [{ id: sid!, title: "New chat", createdAt: Date.now(), updatedAt: Date.now(), messages: [] }, ...p].slice(0, 500));
      setActiveId(sid);
    } else baseMsgs = liveSession.messages;
    const userMsg: LucaMessage = { uid: uid(), role: "user", content: text, ts: Date.now(), attachments: attachments.length ? attachments : undefined };
    const asstMsg: LucaMessage = { uid: uid(), role: "assistant", content: "", ts: Date.now(), tier, streaming: true, toolRounds: [] };
    const id = sid;
    setSessions((p) => p.map((s) => (s.id === id ? { ...s, updatedAt: Date.now(), messages: [...s.messages, userMsg, asstMsg] } : s)));
    // New turn must carry its images as image_url parts (not a plain string),
    // otherwise the thumbnail renders locally but the model never receives them.
    // Documents/code ride along as inlined text blocks via docBlockFor.
    const newImgs = attachments.filter((a) => a.type.startsWith("image/"));
    const docBlock = docBlockFor(attachments);
    const fullText = text + (docBlock ? "\n\n" + docBlock : "");
    const newUserTurn: ChatMsg = newImgs.length
      ? { role: "user", content: [{ type: "text", text: fullText + "\n[Attached: " + attachments.filter((a) => a.type.startsWith("image/")).map((a) => a.name).join(", ") + "]" }, ...newImgs.map((a) => ({ type: "image_url", image_url: { url: a.dataUrl } }))] }
      : { role: "user", content: fullText };
    void runStream(id, asstMsg.uid, [...toHistory(baseMsgs), newUserTurn], text, tier);
  }, [tier, runStream]);

  const streamingRef = useRef(isStreaming);
  useEffect(() => { streamingRef.current = isStreaming; }, [isStreaming]);
  const regenerate = useCallback((sid: string, mu: string) => {
    if (streamingRef.current) return;
    const s = sessionsRef.current.find((x) => x.id === sid);
    if (!s) return;
    const idx = s.messages.findIndex((m) => m.uid === mu);
    if (idx < 0) return;
    const before = s.messages.slice(0, idx);
    const lastUser = [...before].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    const target = s.messages[idx];
    if (!target) return;
    const prev = [...(target.versions || [])];
    if (target.content && !target.streaming && prev[prev.length - 1] !== target.content) prev.push(target.content);
    const fresh: LucaMessage = { uid: mu, role: "assistant", content: "", ts: Date.now(), tier, streaming: true, toolRounds: [], versions: prev.length ? prev : undefined, versionIndex: undefined };
    setSessions((p) => p.map((x) => (x.id === sid ? { ...x, updatedAt: Date.now(), messages: [...before, fresh] } : x)));
    void runStream(sid, mu, toHistory(before), lastUser.content, tier);
  }, [tier, runStream]);

  const editAndResend = useCallback((sid: string, mu: string, text: string) => {
    if (streamingRef.current) return;
    const s = sessionsRef.current.find((x) => x.id === sid);
    if (!s) return;
    const idx = s.messages.findIndex((m) => m.uid === mu);
    if (idx < 0) return;
    const before = s.messages.slice(0, idx);
    const orig = s.messages[idx];
    if (!orig || !orig.uid) return;
    const userMsg: LucaMessage = { ...orig, content: text, ts: Date.now() };
    const asstMsg: LucaMessage = { uid: uid(), role: "assistant", content: "", ts: Date.now(), tier, streaming: true, toolRounds: [] };
    setSessions((p) => p.map((x) => (x.id === sid ? { ...x, updatedAt: Date.now(), messages: [...before, userMsg, asstMsg] } : x)));
    const editImgs = (userMsg.attachments || []).filter((a) => a.type.startsWith("image/"));
    const editDocBlock = docBlockFor(userMsg.attachments);
    const editFullText = text + (editDocBlock ? "\n\n" + editDocBlock : "");
    const editUserTurn: ChatMsg = editImgs.length
      ? { role: "user", content: [{ type: "text", text: editFullText }, ...editImgs.map((a) => ({ type: "image_url", image_url: { url: a.dataUrl } }))] }
      : { role: "user", content: editFullText };
    void runStream(sid, asstMsg.uid, [...toHistory(before), editUserTurn], text, tier);
  }, [tier, runStream]);

  // Centered hero input -> docked composer FLIP on first message.
  const isEmpty = !activeSession || activeSession.messages.length === 0;
  const heroRect = useRef<DOMRect | null>(null);
  const sendFromHero = useCallback((text: string, atts: Attachment[]) => {
    const el = document.querySelector(".hero-input");
    heroRect.current = el ? el.getBoundingClientRect() : null;
    sendMessage(text, atts);
  }, [sendMessage]);
  useEffect(() => {
    if (isEmpty || !heroRect.current) return;
    const el = document.querySelector(".main > .composer-zone");
    const from = heroRect.current;
    heroRect.current = null;
    if (!el) return;
    const to = el.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)`, opacity: 0.4 }, { transform: "none", opacity: 1 }],
      { duration: 320, easing: "cubic-bezier(.22,.8,.24,1)" }
    );
  }, [isEmpty]);

  // Switching chats does NOT abort the previous generation — it keeps
  // running in the background. streamingActive is scoped to activeId, so
  // the new chat shows "Send" while the old one continues to stream.
  const switchChat = useCallback((id: string | null) => {
    setActiveId(id);
    setSearch("");
    setMobileNav(false);
  }, []);
  const handleAuth = useCallback((token: string, user: AuthUser) => {
    // New account on this device: wipe first, THEN hydrate from that
    // account's server record. Nothing survives from the previous session.
    // Exception: guest work is adopted ONLY when the server record is empty
    // (same human, fresh account — never another account's data).
    adoptRef.current = isGuest() ? [...sessionsRef.current] : null;
    wipeClientState();
    setGuest(false); setGuestState(false);
    saveToken(token); saveAuthUser(user);
    setAuthUser(user);
    toast("Welcome, " + user.name);
  }, [toast, wipeClientState]);
  const handleGuest = useCallback(() => {
    setGuest(true); setGuestState(true); setAuthLoading(false);
    toast("You're browsing as a guest — chats stay on this device");
  }, [toast]);
  const logout = useCallback(() => {
    wipeClientState();
    clearAuth(); setGuest(false); setGuestState(false);
    setAuthUser(null);
    toast("Logged out");
    window.setTimeout(() => barbaGo("index.html"), 250);
  }, [toast, wipeClientState]);
  const resetEverything = useCallback(() => {
    abortRef.current?.abort();
    clearDeviceState(); clearAuth(); setGuest(false); setGuestState(false);
    setAuthUser(null); setSessions([]); setActiveId(null); setPanel(null);
    setTier("flash"); setProfile(null);
    document.documentElement.setAttribute("data-theme", "dark");
    window.setTimeout(() => barbaGo("index.html"), 200);
  }, []);
  const refreshSelf = useCallback(() => {
    refreshMe().then((u) => { if (u) { saveAuthUser(u); setAuthUser(u); } }).catch(() => { /* stay with cached user */ });
  }, []);
  const handleEditDraft = useCallback((text: string) => {
    setComposerDraft(text);
  }, []);
  // Stable suggestion sender — keeps memoised messages from re-rendering.
  const sendSuggestion = useCallback((t: string) => {
    sendMessage(t, []);
  }, [sendMessage]);

  if (authLoading) {
    return <div className="center-page"><div className="spinner" /></div>;
  }
  if (namespace === "home" && !authUser && !guest) {
    return <Auth onAuth={handleAuth} onGuest={handleGuest} />;
  }
  if (!authUser && !guest) return <Auth onAuth={handleAuth} onGuest={handleGuest} />;
  if (authUser && !confirmedUsername(authUser.id) && (!authUser.username || /^(googleuser|githubuser|user\d*$)/i.test(authUser.username))) {
    return (
      <div className="center-page">
        <div className="auth-card">
          <h1>Pick a username</h1>
          <p className="sub">Signed in as {authUser.email}. Usernames stick around, so pick one you like.</p>
          <div className="field"><label htmlFor="un">Username</label>
            <input id="un" type="text" value={nameDraft} onChange={(e) => setNameDraft(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="yourname" maxLength={20} /></div>
          <button className="btn-primary" disabled={nameDraft.trim().length < 3} onClick={async () => {
            const token = loadToken();
            if (!token) return;
            try {
              const { error } = await setUsername(token, nameDraft.trim());
              if (error) throw new Error(error);
              markUsernameConfirmed(authUser.id);
              saveAuthUser({ ...authUser, username: nameDraft.trim() });
              setAuthUser({ ...authUser, username: nameDraft.trim() });
              toast("@" + nameDraft.trim() + " saved!");
            } catch (e) { toast(e instanceof Error ? e.message : "Failed to save"); }
          }}>Continue</button>
        </div>
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="center-page">
        <div className="auth-card">
          <h1>What should I call you?</h1>
          <p className="sub">This helps me answer in a way that suits you. You can change it anytime in your profile.</p>
          <div className="field"><span className="flabel" id="avatar-label">Profile picture <span className="opt">(optional)</span></span>
            <label className="avatar" style={{ width: 64, height: 64, fontSize: 22, cursor: "pointer" }} title="Upload a profile picture" aria-labelledby="avatar-label">
              {avatarDraft ? <img src={avatarDraft} alt="" /> : (nameDraft.trim() ? nameDraft.trim().charAt(0).toUpperCase() : "?")}
              <input type="file" accept="image/*" hidden aria-label="Upload a profile picture" onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f || !f.type.startsWith("image/")) return;
                const r = new FileReader();
                r.onload = () => { void downscaleImage(String(r.result), 256).then((v) => setAvatarDraft(v)); };
                r.readAsDataURL(f);
              }} />
            </label></div>
          <div className="field"><label htmlFor="nm">Name</label>
            <input id="nm" type="text" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Harper" maxLength={40} /></div>
          <button className="btn-primary" onClick={() => {
            const p = { name: nameDraft.trim() || "User", persona: null, theme: settings.theme, avatar: avatarDraft };
            setProfile(p); saveProfile(p);
            setSettings((s) => ({ ...s, theme: p.theme }));
            setNameDraft("");
            setAvatarDraft(null);
            // Permanent for this account: push to the server record NOW
            // instead of relying on the debounced sync (tab could close).
            if (authUser && !guest) {
              const t = loadToken();
              if (t) void putUserData(t, { sessions, activeId, settings, tier, profile: p });
            }
          }}>Start chatting</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar
        sessions={sessions} activeId={activeId} search={search} onSearch={setSearch}
        onSelect={(id) => switchChat(id)} onNew={() => switchChat(null)}
        onRename={(id, t) => setSessions((p) => p.map((s) => (s.id === id ? { ...s, title: t } : s)))}
        onTogglePin={(id) => setSessions((p) => p.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)))}
        onDelete={(id) => {
          if (streaming?.sessionId === id) abortRef.current?.abort();
          setSessions((p) => p.filter((s) => s.id !== id));
          if (activeId === id) setActiveId(null);
          toast("Chat deleted");
        }}
        onOpenSettings={() => setPanel("settings")} onOpenProfile={() => setPanel("profile")}
        isAdmin={authUser?.isAdmin} onOpenAdmin={() => setPanel("admin")}
        profile={profile} mobileOpen={mobileNav} onCloseMobile={() => setMobileNav(false)}
        collapsed={collapsed} onToggleSidebar={() => setCollapsed((v) => !v)}
      />
      <div className="main">
        {!isEmpty && (
        <header className="topbar">
          <button className="icon-btn only-mobile" onClick={() => setMobileNav(true)} aria-label="Open sidebar"><Menu size={17} /></button>
          {collapsed && (
            <button className="icon-btn only-desktop" onClick={() => setCollapsed(false)} aria-label="Open sidebar"><PanelLeft size={15} /></button>
          )}
          <h1>{activeSession ? activeSession.title : "New chat"}</h1>
        </header>
        )}
        {isEmpty ? (
          <div className="hero">
            <button className="icon-btn only-mobile hero-menu-btn" onClick={() => setMobileNav(true)} aria-label="Open sidebar"><Menu size={17} /></button>
            <h1 className="hero-greeting">Hi{profile?.name ? ` ${profile.name}` : ""}, what's on your mind?</h1>
            <div className="hero-input">
              <Composer streaming={streamingActive} onSend={sendFromHero} onStop={() => abortRef.current?.abort()}
                tier={tier} onTierChange={(t) => setTier(t)} settings={settings} onToast={toast} prefill={composerDraft} onPrefillConsumed={() => setComposerDraft(null)} />
            </div>
          </div>
        ) : (
          <>
            <ChatArea session={activeSession} profile={profile} settings={settings}
              onSuggestion={sendSuggestion} onRegenerate={regenerate}
              onEditResend={editAndResend} onToast={toast} onEditDraft={handleEditDraft} />
            <Composer streaming={streamingActive} onSend={sendMessage} onStop={() => abortRef.current?.abort()}
              tier={tier} onTierChange={(t) => setTier(t)} settings={settings} onToast={toast} prefill={composerDraft} onPrefillConsumed={() => setComposerDraft(null)} />
          </>
        )}
      </div>

      {panel === "settings" && (
        <SettingsPanel settings={settings} onChange={(p) => setSettings((s) => ({ ...s, ...p }))} onClose={() => setPanel(null)} onReset={resetEverything} />
      )}
      {panel === "profile" && (
        <ProfilePanel profile={profile} authUser={authUser}
          onSave={(p) => setProfile((prev) => { const next = { ...(prev || { name: "", persona: null, theme: settings.theme, avatar: null }), ...p }; saveProfile(next); return next; })}
          onClose={() => setPanel(null)} onLogout={logout} onToast={toast} />
      )}
      {panel === "admin" && authUser?.isAdmin && (
        <AdminPanel token={loadToken() || ""} authUserId={authUser.id} onRefreshSelf={refreshSelf} onClose={() => setPanel(null)} onToast={toast} />
      )}
      {activeArtifactId && artifacts[activeArtifactId] && (
        <Suspense fallback={null}>
          <ArtifactPanel artifact={artifacts[activeArtifactId]} onClose={() => setActiveArtifactId(null)} />
        </Suspense>
      )}

      <div className="toasts">
        {toasts.map((t) => <div key={t.id} className="toast" role="status">{t.text}</div>)}
      </div>
    </div>
  );
}
