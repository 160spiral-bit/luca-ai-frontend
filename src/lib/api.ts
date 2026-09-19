// Luca v2 — backend client. Speaks the exact server.js contract.
import { loadSettings, loadToken, uid } from "./store";
import type { AuthUser, Settings, Source, Tier } from "./store";

export const base = () => (loadSettings().backendUrl || "https://luca-ai-iozy.onrender.com").replace(/\/+$/, "");
const authHeaders = (): Record<string, string> => {
  const t = loadToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export type EngineEvent =
  | { kind: "reasoning"; text: string }
  | { kind: "content"; text: string }
  | { kind: "stage"; stage: string; label: string }
  | { kind: "sources"; sources: Source[] }
  | { kind: "search-info"; query: string; reason: string; count: number }
  | { kind: "tool-start"; roundId: string; name: string; query: string }
  | { kind: "tool-end"; roundId: string; sources: { title: string; url: string; host: string }[]; ms: number }
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
    const res = await fetch(base() + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ modelTier: opts.tier, messages: opts.history, stream: true, tools: true, userSettings }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) throw new Error("Backend error " + res.status);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let sawDone = false;
    let currentEvent = "";
    const q: EngineEvent[] = [];
    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (trimmed.startsWith("event:")) { currentEvent = trimmed.slice(6).trim(); return; }
      if (!trimmed.startsWith("data:")) return;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") { sawDone = true; currentEvent = ""; return; }
      try {
        const j = JSON.parse(payload);
        // Artifact channel — separate from content so panel and bubble render concurrently
        if (currentEvent === "artifact_start" || j.artifactType) {
          if (j.id) q.push({ kind: "artifact_start", id: String(j.id), artifactType: String(j.artifactType || "html"), title: String(j.title || "Artifact") });
          currentEvent = ""; return;
        }
        if (currentEvent === "artifact_delta") {
          if (j.id && typeof j.chunk === "string") q.push({ kind: "artifact_delta", id: String(j.id), chunk: j.chunk });
          currentEvent = ""; return;
        }
        if (currentEvent === "artifact_end") {
          if (j.id) q.push({ kind: "artifact_end", id: String(j.id) });
          currentEvent = ""; return;
        }
        // Legacy artifact payload without event: prefix
        if (j.event === "artifact_start" && j.id) { q.push({ kind: "artifact_start", id: String(j.id), artifactType: String(j.artifactType || "html"), title: String(j.title || "Artifact") }); return; }
        if (j.event === "artifact_delta" && j.id) { q.push({ kind: "artifact_delta", id: String(j.id), chunk: String(j.chunk || "") }); return; }
        if (j.event === "artifact_end" && j.id) { q.push({ kind: "artifact_end", id: String(j.id) }); return; }
        if (j.retry_after_stall) q.push({ kind: "reset" });
        if (j.meta && j.meta.model) q.push({ kind: "meta", model: String(j.meta.model), provider: String(j.meta.provider || ""), pinned: !!j.meta.pinned });
        if (typeof j.reasoning === "string" && j.reasoning) q.push({ kind: "reasoning", text: j.reasoning });
        if (typeof j.stage === "string" && j.stage && typeof j.label === "string" && j.label) q.push({ kind: "stage", stage: j.stage, label: j.label });
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
          for (const tc of j.tool_calls) {
            if (tc?.function) {
              let query = "";
              try { query = JSON.parse(tc.function.arguments || "{}").query || ""; } catch { /* non-JSON tool args — query stays empty */ }
              q.push({ kind: "tool-start", roundId: tc.id || "call_" + uid(), name: tc.function.name || "", query });
            }
          }
        }
      } catch { /* partial line */ }
      currentEvent = "";
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) handleLine(line);
      while (q.length) yield q.shift()!;
      if (sawDone) break;
    }
    while (q.length) yield q.shift()!;
    yield { kind: "done" };
  } finally {
    opts.signal.removeEventListener("abort", onAbort);
  }
}

export const isAbortError = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

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
export async function nameChat(userText: string, reply: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(base() + "/api/name-chat", {
      method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ userMessage: userText, assistantReply: reply }),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j.title === "string" && j.title.trim() ? j.title.trim() : null;
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
