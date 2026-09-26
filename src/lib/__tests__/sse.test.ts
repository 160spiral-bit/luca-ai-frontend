import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { streamChat } from "../api";
import type { EngineEvent } from "../api";
import type { Settings } from "../store";

const settings = (): Settings => ({
  theme: "dark", enterToSend: true, showTimestamps: false, autoScroll: true, backendUrl: "",
  customPrompt: "", personality: { creativity: 50, formality: 50, verbosity: 50 },
});

function sseResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder();
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}

async function collect(chunks: string[]): Promise<EngineEvent[]> {
  vi.stubGlobal("fetch", async () => sseResponse(chunks));
  // /api/chat requires a bearer token, and streamChat resolves a session before
  // spending a request. Seed one so these tests exercise SSE parsing rather than
  // the guest-mint path (covered separately below).
  localStorage.setItem("luca-guest-token", "test-guest-token");
  const gen = streamChat({
    tier: "flash", history: [], settings: settings(),
    profile: null, auth: null, signal: new AbortController().signal,
  });
  const out: EngineEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe("streamChat SSE parsing", () => {
  it("reassembles frames split across chunks", async () => {
    const evs = await collect(['data: {"con', 'tent":"hel', 'lo"}\n\ndata: [DONE]\n\n']);
    expect(evs).toContainEqual({ kind: "content", text: "hello" });
    expect(evs[evs.length - 1]).toEqual({ kind: "done" });
  });

  it("handles \\r\\n line endings", async () => {
    const evs = await collect(['data: {"content":"hi"}\r\n\r\ndata: [DONE]\r\n\r\n']);
    expect(evs).toContainEqual({ kind: "content", text: "hi" });
  });

  it("skips malformed JSON without killing the stream", async () => {
    const evs = await collect(['data: {broken\n\ndata: {"content":"ok"}\n\ndata: [DONE]\n\n']);
    expect(evs).toContainEqual({ kind: "content", text: "ok" });
    expect(evs[evs.length - 1]).toEqual({ kind: "done" });
  });

  it("routes event: artifact frames to the artifact channel", async () => {
    const evs = await collect([
      'event: artifact_delta\ndata: {"id":"a1","chunk":"<h1>"}\n\n',
      'data: [DONE]\n\n',
    ]);
    expect(evs).toContainEqual({ kind: "artifact_delta", id: "a1", chunk: "<h1>" });
  });

  it("mints and stores a guest session when no token exists", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      seen.push(url);
      if (url.includes("/api/auth/guest")) {
        return new Response(JSON.stringify({ token: "minted-token", limit: 60 }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      return sseResponse(['data: {"content":"hi"}\n\ndata: [DONE]\n\n']);
    });
    const gen = streamChat({
      tier: "flash", history: [], settings: settings(),
      profile: null, auth: null, signal: new AbortController().signal,
    });
    const out: EngineEvent[] = [];
    for await (const ev of gen) out.push(ev);

    expect(seen[0]).toContain("/api/auth/guest");
    expect(seen[1]).toContain("/api/chat");
    expect(localStorage.getItem("luca-guest-token")).toBe("minted-token");
    expect(out).toContainEqual({ kind: "content", text: "hi" });
  });

  it("surfaces the server's message on a rejected session", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ error: "Sign in or continue as guest to chat.", code: "session_required" }), {
        status: 401, headers: { "Content-Type": "application/json" },
      }));
    localStorage.setItem("luca-guest-token", "stale-token");
    const gen = streamChat({
      tier: "flash", history: [], settings: settings(),
      profile: null, auth: null, signal: new AbortController().signal,
    });
    let thrown = "";
    try { for await (const _ of gen) { /* drain */ } }
    catch (e) { thrown = e instanceof Error ? e.message : String(e); }
    expect(thrown).toBe("Sign in or continue as guest to chat.");
  });
});
