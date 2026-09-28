// Luca v2 — backend client. Speaks the exact server.js contract.
import { createParser } from "eventsource-parser";
import { loadGuestToken, loadSettings, loadToken, saveGuestToken, uid } from "./store";
import type { AuthUser, Settings, Source, Tier } from "./store";

const FALLBACK = "https://luca-ai-iozy.onrender.com";
// backendUrl is user-writable in localStorage with no UI — an XSS foothold
// could repoint it (and the Bearer header) at an attacker server. Only hosts
// on this allowlist are ever used. The build-time VITE_API_URL extends the
// list so a new backend origin isn't silently ignored (the old config trap).
const ENV_HOSTS: string[] = (() => {
  try {
    const env = import.meta.env.VITE_API_URL as string | undefined;
    return env ? [new URL(env).hostname] : [];
  } catch {
    return [];
  }
})();
const ALLOWED_HOSTS = new Set(["luca-ai-iozy.onrender.com", "localhost", "127.0.0.1", ...ENV_HOSTS]);
function safeBase(url: string): string | null {
  try {
    const u = new URL(url);
    return ALLOWED_HOSTS.has(u.hostname) ? u.origin : null;
  } catch {
    return null;
  }
}
export const base = () => {
  const env = (import.meta.env.VITE_API_URL as string | undefined) || "";
  const raw = (env || loadSettings().backendUrl || FALLBACK).replace(/\/+$/, "");
  return safeBase(raw) || FALLBACK;
};
// /api/chat requires a bearer token. Signed-in users send their account JWT;
// guests send the anonymous session minted by /api/auth/guest. Without either,
// the backend answers 401 rather than spending provider credit.
const authHeaders = (): Record<string, string> => {
  const t = loadToken() || loadGuestToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// De-duplicates concurrent mints (guest entry and the first send can race).
let minting: Promise<string | null> | null = null;
export async function mintGuestSession(): Promise<string | null> {
  const existing = loadGuestToken();
  if (existing) return existing;
  if (minting) return minting;
  minting = (async () => {
    try {
      const r = await fetch(base() + "/api/auth/guest", { method: "POST" });
      if (!r.ok) return null;
      const j = await r.json();
      if (typeof j?.token !== "string" || !j.token) return null;
      saveGuestToken(j.token);
      return j.token;
    } catch {
      return null;
    } finally {
      minting = null;
    }
  })();
  return minting;
}

// Guarantees the caller has *some* session before spending a request. Guests
// reaching the composer without a token (fresh guest flag, cleared storage,
// token older than its TTL) get one minted here rather than a 401.
async function ensureSessionToken(): Promise<boolean> {
  if (loadToken() || loadGuestToken()) return true;
  if (!(await mintGuestSession())) return false;
  return !!(loadToken() || loadGuestToken());
}

// Named API calls — no component should call fetch directly.
const req = (path: string, token?: string, init?: RequestInit): Promise<Response> =>
  fetch(base() + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...((init?.headers as Record<string, string>) || {}) },
  });

export const pingHealth = () => fetch(base() + "/api/health").catch(() => null);
export const getUserData = (token: string) => req("/api/user/data", token);
export const verifySession = (token: string) => req("/api/auth/verify", token);
export const putUserData = (token: string, body: unknown) =>
  req("/api/user/data", token, { method: "POST", body: JSON.stringify(body) }).catch(() => null);
export const setUsername = async (token: string, username: string): Promise<{ error?: string }> => {
  const r = await req("/api/auth/username", token, { method: "PUT", body: JSON.stringify({ username }) });
  if (!r.ok) {
    try {
      const j = await r.json();
      return { error: (j.error as string) || "Failed" };
    } catch {
      return { error: "Failed" };
    }
  }
  return {};
};
export const getModels = async (): Promise<{ provider: string; model: string; tier: string }[] | null> => {
  try {
    const r = await req("/api/models");
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j?.models) ? j.models : null;
  } catch {
    return null;
  }
};
export const adminStats = (token: string) => req("/api/admin/stats", token);
export const adminUsers = (token: string) => req("/api/admin/users", token);
export const updateAdminUser = (token: string, id: string, patch: Record<string, unknown>) =>
  req(`/api/admin/users/${id}`, token, { method: "PUT", body: JSON.stringify(patch) });
export const clearPending = (token: string) => req("/api/admin/clear-pending", token, { method: "POST" });
export const testModel = (token: string, q: string) => req(`/api/test?q=${encodeURIComponent(q)}`, token);

export type EngineEvent =
  | { kind: "reasoning"; text: string }
  | { kind: "content"; text: string }
  | { kind: "stage"; stage: string; label: string }
  | { kind: "sources"; sources: Source[] }
  | { kind: "search-info"; query: string; reason: string; count: number }
  | { kind: "tool-start"; roundId: string; name: string; query: string }
  | { kind: "tool-end"; roundId: string; sources: { title: string; url: string; host: string }[]; ms: number; result?: string }
  | { kind: "meta"; model: string; provider: string; pinned?: boolean }
  | { kind: "error"; message: string; code?: string; retryable?: boolean }
  | { kind: "artifact_start"; id: string; artifactType: string; title: string }
  | { kind: "artifact_delta"; id: string; chunk: string }
  | { kind: "artifact_end"; id: string }
  | { kind: "reset" }
  | { kind: "done" };

export interface ChatMsg { role: string; content: string | { type: string; text?: string; image_url?: { url: string } }[]; tool_calls?: unknown[]; }

export async function* streamChat(opts: {
  tier: Tier; history: ChatMsg[]; settings: Settings;
  profile: { name: string; persona: string | null; hasAvatar?: boolean } | null;
  auth: AuthUser | null; signal: AbortSignal;
}): AsyncGenerator<EngineEvent> {
  const userSettings: Record<string, unknown> = {
    personality: opts.settings.personality,
    customPrompt: opts.settings.customPrompt,
    ...(opts.profile ? { profile: { name: opts.profile.name, persona: opts.profile.persona, hasAvatar: !!opts.profile.hasAvatar } } : {}),
    ...(opts.auth ? { account: { username: opts.auth.username || "", isAdmin: !!opts.auth.isAdmin, badges: String(opts.auth.badge || "") } } : {}),
  };
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  opts.signal.addEventListener("abort", onAbort, { once: true });
  try {
    // Never spend a request without a session: guests get one minted on demand
    // so a cleared/expired guest token doesn't surface as a bare 401.
    if (!(await ensureSessionToken())) throw new Error("Could not start a session — check your connection and retry.");
    const res = await fetch(base() + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ modelTier: opts.tier, messages: opts.history, stream: true, tools: true, userSettings }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) {
      // Surface the server's own message (session required / guest limit /
      // suspended) instead of a bare status code.
      let msg = "Backend error " + res.status;
      try {
        const j = await res.json();
        if (j && typeof j.error === "string" && j.error) msg = j.error;
      } catch { /* non-JSON error body — keep the status-code message */ }
      throw new Error(msg);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let sawDone = false;
    const q: EngineEvent[] = [];
    // Stall watchdog: the main stream previously had no idle timer, so a hung
    // backend spun forever. 90s without any sign of life aborts with
    // TimeoutError, which runStream surfaces as a retryable error. The timer
    // resets on bytes AND on stage/tool events, so a legitimate long tool
    // call (run_code, fetch_page) is never mistaken for a stall.
    const STALL_MS = 90_000;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    const beat = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => ctrl.abort(new DOMException("Stream stalled", "TimeoutError")), STALL_MS);
    };
    const handlePayload = (evName: string | undefined, payload: string) => {
      const data = payload.trim();
      if (!data) return;
      if (data === "[DONE]") { sawDone = true; return; }
      try {
        const j = JSON.parse(data);
        const currentEvent = evName || "";
        // Artifact channel — separate from content so panel and bubble render concurrently
        if (currentEvent === "artifact_start" || j.artifactType) {
          if (j.id) q.push({ kind: "artifact_start", id: String(j.id), artifactType: String(j.artifactType || "html"), title: String(j.title || "Artifact") });
          return;
        }
        if (currentEvent === "artifact_delta") {
          if (j.id && typeof j.chunk === "string") q.push({ kind: "artifact_delta", id: String(j.id), chunk: j.chunk });
          return;
        }
        if (currentEvent === "artifact_end") {
          if (j.id) q.push({ kind: "artifact_end", id: String(j.id) });
          return;
        }
        // Legacy artifact payload without event: prefix
        if (j.event === "artifact_start" && j.id) { q.push({ kind: "artifact_start", id: String(j.id), artifactType: String(j.artifactType || "html"), title: String(j.title || "Artifact") }); return; }
        if (j.event === "artifact_delta" && j.id) { q.push({ kind: "artifact_delta", id: String(j.id), chunk: String(j.chunk || "") }); return; }
        if (j.event === "artifact_end" && j.id) { q.push({ kind: "artifact_end", id: String(j.id) }); return; }
        if (j.retry_after_stall) q.push({ kind: "reset" });
        if (j.meta && j.meta.model) q.push({ kind: "meta", model: String(j.meta.model), provider: String(j.meta.provider || ""), pinned: !!j.meta.pinned });
        if (typeof j.reasoning === "string" && j.reasoning) q.push({ kind: "reasoning", text: j.reasoning });
        if (typeof j.stage === "string" && j.stage && typeof j.label === "string" && j.label) {
          // A stage event is proof of life: reset the stall watchdog so a long
          // tool phase is never mistaken for a dead stream.
          beat();
          q.push({ kind: "stage", stage: j.stage, label: j.label });
        }
        if (Array.isArray(j.sources)) {
          const srcs = j.sources.filter((s: unknown) => s && typeof (s as Source).url === "string").map((s: Source, i: number) => ({
            id: typeof s.id === "number" ? s.id : i + 1,
            url: String(s.url), domain: String(s.domain || ""), title: String(s.title || s.domain || "Source"),
          }));
          if (srcs.length) q.push({ kind: "sources", sources: srcs });
        }
        if (j.searchInfo && typeof j.searchInfo.query === "string") {
          q.push({ kind: "search-info", query: String(j.searchInfo.query).slice(0, 140), reason: String(j.searchInfo.reason || ""), count: Number(j.searchInfo.count) || 0 });
        }
        const c = typeof j.content === "string" ? j.content : typeof j.reply === "string" ? j.reply : "";
        if (c) q.push({ kind: "content", text: c });
        if (j.error && typeof j.error === "string") {
          if (!c) q.push({ kind: "error", message: j.error, code: typeof j.code === "string" ? j.code : undefined, retryable: !!j.retryable });
          else q.push({ kind: "content", text: "\n\n_" + j.error + "_" });
        }
        if (Array.isArray(j.tool_calls)) {
          let sawTool = false;
          for (const tc of j.tool_calls) {
            if (tc?.function) {
              let query = "";
              try {
                const rawArgs = tc.function.arguments;
                const a = typeof rawArgs === "string" ? JSON.parse(rawArgs || "{}") : (rawArgs || {});
                query = a.query || a.q || a.url || (typeof a.code === "string" ? a.code.slice(0, 120) : "") || "";
              } catch { /* non-JSON tool args — query stays empty */ }
              q.push({ kind: "tool-start", roundId: tc.id || "call_" + uid(), name: tc.function.name || "", query });
              sawTool = true;
            }
          }
          if (sawTool) beat();
        }
        if (j["tool-start"] && typeof j["tool-start"] === "object") {
          const t = j["tool-start"] as { roundId?: unknown; name?: unknown; query?: unknown };
          beat();
          q.push({ kind: "tool-start", roundId: String(t.roundId || "call_" + uid()), name: String(t.name || ""), query: String(t.query || "") });
        }
        if (j["tool-end"] && typeof j["tool-end"] === "object") {
          const t = j["tool-end"] as { roundId?: unknown; sources?: unknown; ms?: unknown; result?: unknown };
          const srcs = Array.isArray(t.sources)
            ? (t.sources as Source[]).filter((s) => s && typeof s.url === "string").map((s) => ({
                title: String(s.title || s.domain || "Source"), url: String(s.url), host: String(s.domain || ""),
              }))
            : [];
          q.push({
            kind: "tool-end", roundId: String(t.roundId || ""),
            sources: srcs, ms: Number(t.ms) || 0,
            ...(typeof t.result === "string" && t.result ? { result: t.result.slice(0, 2000) } : {}),
          });
        }
      } catch { /* malformed payload — skip, never crash the stream */ }
    };
    // Spec-compliant SSE: handles \r\n, split frames, multi-line data:, and
    // event: fields. Replaces the hand-rolled \n splitter (audit P1-12).
    const parser = createParser({
      onEvent: (ev) => handlePayload(ev.event, ev.data),
    });
    beat();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        beat();
        parser.feed(dec.decode(value, { stream: true }));
        while (q.length) yield q.shift()!;
        if (sawDone) break;
      }
    } finally {
      if (stallTimer) clearTimeout(stallTimer);
    }
    while (q.length) yield q.shift()!;
    yield { kind: "done" };
  } finally {
    opts.signal.removeEventListener("abort", onAbort);
  }
}

export async function followups(text: string): Promise<string[]> {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 25000);
    const r = await fetch(base() + "/api/followups", {
      method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ text: text.slice(0, 2000) }),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j.followups) ? j.followups.filter((s: unknown) => typeof s === "string").slice(0, 4) : [];
  } catch { return []; }
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  const r = await fetch(base() + "/api/auth/verify", { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 401) return null;
  if (!r.ok) throw new Error("verify " + r.status);
  const j = await r.json();
  return j.user || null;
}
export async function refreshMe(): Promise<AuthUser | null> {
  const t = loadToken();
  if (!t) return null;
  try {
    const r = await fetch(base() + "/api/auth/verify", { headers: { Authorization: `Bearer ${t}` } });
    if (!r.ok) return null;
    const j = await r.json();
    return j.user || null;
  } catch { return null; }
}
export async function nameChatFromMessages(messages: ChatMsg[]): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(base() + "/api/name-chat", {
      method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ messages }),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j.title === "string" && j.title.trim() ? j.title.trim() : null;
  } catch { return null; }
}
