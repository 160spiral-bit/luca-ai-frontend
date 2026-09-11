// Luca v2 — types + storage. Keys preserved from v1 so sessions survive.
export type Tier = "flash" | "pro";
export type Role = "user" | "assistant";

export interface Attachment { id: string; name: string; type: string; size: number; dataUrl: string; }
export interface ToolRound { id: string; name: string; query: string; sources: { title: string; url: string; host: string }[]; status: "running" | "done"; ms?: number; }
export interface Source { id: number; url: string; domain: string; title: string; }
export interface SearchInfo { query: string; reason: string; count: number; }
export interface LucaMessage {
  uid: string; role: Role; content: string; ts: number;
  tier?: Tier; reasoning?: string; thinkingMs?: number;
  stage?: string; stageLabel?: string;
  sources?: Source[]; searchInfo?: SearchInfo; followups?: string[];
  toolRounds?: ToolRound[]; attachments?: Attachment[];
  error?: string; interrupted?: boolean; streaming?: boolean;
  versions?: string[]; versionIndex?: number;
  modelMeta?: { model: string; provider: string; pinned?: boolean } | null;
}
export interface Session { id: string; title: string; createdAt: number; updatedAt: number; pinned?: boolean; messages: LucaMessage[]; }
export interface Settings {
  theme: "dark" | "light"; enterToSend: boolean; showTimestamps: boolean;
  autoScroll: boolean; backendUrl: string; customPrompt: string;
  personality: { creativity: number; formality: number; verbosity: number };
}
export interface Profile { name: string; persona: string | null; theme: "dark" | "light"; avatar: string | null; complete?: boolean; }
export interface ArtifactVersion { version: number; content: string; createdAt: string; }
export interface Artifact { id: string; artifactType: "code" | "markdown" | "html" | "svg" | "mermaid"; title: string; versions: ArtifactVersion[]; }
export function appendArtifactVersion(artifact: Artifact, content: string): Artifact {
  return { ...artifact, versions: [...artifact.versions, { version: artifact.versions.length + 1, content, createdAt: new Date().toISOString() }] };
}
export interface AuthUser {
  id: string; email: string; name: string; username: string; provider: string;
  avatar?: string | null; verified?: boolean; isAdmin?: boolean;
  badge?: string | null; modelOverride?: string | null;
}

const K = {
  settings: "luca-settings", sessions: "luca-sessions", active: "luca-active-session",
  tier: "luca_tier", onboard: "luca-onboarding", token: "luca-auth-token",
  user: "luca-auth-user", guest: "luca-guest", confirmed: "luca-username-confirmed",
};
function get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function set(k: string, v: string) { try { localStorage.setItem(k, v); } catch {} }
function del(k: string) { try { localStorage.removeItem(k); } catch {} }
function parse<T>(raw: string | null, fb: T): T { try { return raw ? { ...fb, ...JSON.parse(raw) } as T : fb; } catch { return fb; } }

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const DEFAULT_SETTINGS: Settings = {
  theme: "dark", enterToSend: true, showTimestamps: false, autoScroll: true, backendUrl: "",
  customPrompt: "", personality: { creativity: 50, formality: 50, verbosity: 50 },
};
export const defaultSettings = (): Settings => ({ ...DEFAULT_SETTINGS, personality: { ...DEFAULT_SETTINGS.personality } });
// Full device wipe for account switches: clears every client slice so the next
// session hydrates purely from the new account's server record. Never rely on
// overwriting individual fields.
export const clearDeviceState = () => {
  [K.settings, K.sessions, K.active, K.tier, K.onboard, K.token, K.user, K.guest, K.confirmed].forEach(del);
  try { sessionStorage.clear(); } catch {}
};
export const loadSettings = (): Settings => {
  const raw = get(K.settings);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const p = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...p, personality: { ...DEFAULT_SETTINGS.personality, ...(p.personality || {}) } };
  } catch { return { ...DEFAULT_SETTINGS }; }
};
export const saveSettings = (s: Settings) => set(K.settings, JSON.stringify(s));

export const loadSessions = (): Session[] => {
  try {
    const p = JSON.parse(get(K.sessions) || "[]");
    if (!Array.isArray(p)) return [];
    // A stream can never survive a page reload: any message saved mid-stream
    // would otherwise render a stuck "thinking" spinner forever (or look like
    // it's regenerating). Settle them: empty stubs become interrupted (Retry
    // button), partial content just stops streaming.
    for (const s of p) {
      if (!s || !Array.isArray(s.messages)) continue;
      for (const m of s.messages) {
        if (m && m.streaming) {
          m.streaming = false;
          if (m.role === "assistant" && !String(m.content || "").trim()) m.interrupted = true;
        }
      }
    }
    return p;
  } catch { return []; }
};
export const saveSessions = (l: Session[]) => set(K.sessions, JSON.stringify(l.slice(0, 500)));
export const loadActiveId = (): string | null => get(K.active);
export const saveActiveId = (id: string | null) => { if (id) set(K.active, id); else del(K.active); };

export const loadTier = (): Tier => { const v = get(K.tier); return v === "pro" ? "pro" : "flash"; };
export const saveTier = (t: Tier) => set(K.tier, t);

export const loadProfile = (): Profile | null => {
  try { const p = JSON.parse(get(K.onboard) || "null"); return p && p.complete === true ? p : null; } catch { return null; }
};
export const saveProfile = (p: Profile) => set(K.onboard, JSON.stringify({ ...p, complete: true }));

export const loadToken = (): string | null => get(K.token);
export const saveToken = (t: string) => set(K.token, t);
export const loadAuthUser = (): AuthUser | null => { try { const r = get(K.user); return r ? JSON.parse(r) : null; } catch { return null; } };
export const saveAuthUser = (u: AuthUser) => set(K.user, JSON.stringify(u));
export const clearAuth = () => { del(K.token); del(K.user); };
export const isGuest = () => get(K.guest) === "true";
export const setGuest = (v: boolean) => { if (v) set(K.guest, "true"); else del(K.guest); };
export const confirmedUsername = (id: string): boolean => {
  try { return !!JSON.parse(get(K.confirmed) || "{}")[id]; } catch { return false; }
};
export const markUsernameConfirmed = (id: string) => {
  try { const m = JSON.parse(get(K.confirmed) || "{}"); m[id] = true; set(K.confirmed, JSON.stringify(m)); } catch {}
};
export const resetAll = () => [K.settings, K.sessions, K.active, K.tier, K.onboard, K.token, K.user].forEach(del);

export const titleFromMessage = (t: string) => {
  const c = t.replace(/\s+/g, " ").trim();
  if (c.length <= 44) return c || "New chat";
  return c.slice(0, 44).replace(/\s+\S*$/, "") + "…";
};
export const dayBucket = (ts: number) => {
  const n = new Date(); const s = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  if (ts >= s) return "Today";
  if (ts >= s - 86400000) return "Yesterday";
  if (ts >= s - 6 * 86400000) return "Previous 7 days";
  return "Older";
};
export const formatTime = (ts: number) => {
  const d = new Date(ts);
  const t = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? t : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${t}`;
};
export async function copyText(t: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(t); return true; }
  catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove(); return true;
    } catch { return false; }
  }
}
export function downscaleImage(dataUrl: string, maxSize: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(1, maxSize / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * sc));
      c.height = Math.max(1, Math.round(img.height * sc));
      const ctx = c.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      try { resolve(c.toDataURL("image/jpeg", 0.88)); } catch { resolve(dataUrl); }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
