import { useCallback, useRef } from "react";
import type { MutableRefObject } from "react";
import { followups, nameChatFromMessages, streamChat } from "../lib/api";
import type { ChatMsg, EngineEvent } from "../lib/api";
import { titleFromMessage, uid } from "../lib/store";
import type {
  Artifact,
  Attachment,
  AuthUser,
  LucaMessage,
  Profile,
  Session,
  Settings,
  Tier,
  ToolRound,
} from "../lib/store";

// Inline document/code attachments as text blocks so the model actually
// receives them. Images travel as image_url parts; everything else must be
// text here or it is silently dropped.
export function docBlockFor(atts?: Attachment[]): string {
  const docs = (atts || []).filter((a) => !a.type.startsWith("image/"));
  if (!docs.length) return "";
  return docs
    .map((a) =>
      a.text
        ? `[Attached file: ${a.name}]\n${a.text}`
        : `[Attached file: ${a.name}] (could not extract text from this file type — contents not included)`
    )
    .join("\n\n");
}

function toHistory(msgs: LucaMessage[]): ChatMsg[] {
  return msgs
    .filter((m) => (m.role === "user" ? m.content : m.content || m.toolRounds?.length))
    .map((m, i, arr) => {
      if (m.role !== "user") return { role: m.role, content: m.content };
      const docs = docBlockFor(m.attachments);
      const text =
        m.content +
        (m.attachments?.length ? "\n[Attached: " + m.attachments.map((a) => a.name).join(", ") + "]" : "") +
        (docs ? "\n\n" + docs : "");
      const imgs = (m.attachments || []).filter((a) => a.type.startsWith("image/"));
      if (imgs.length && i >= arr.length - 3) {
        return {
          role: "user",
          content: [
            { type: "text", text },
            ...imgs.map((a) => ({ type: "image_url", image_url: { url: a.dataUrl } })),
          ],
        };
      }
      return { role: "user", content: text };
    });
}

// Send / regenerate / edit flows (extracted from App.tsx god component).
export function useChatActions(opts: {
  sessionsRef: MutableRefObject<Session[]>;
  activeIdRef: MutableRefObject<string | null>;
  streamsRef: MutableRefObject<Record<string, string>>;
  aborts: MutableRefObject<Map<string, AbortController>>;
  setStreams: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
  setArtifacts: React.Dispatch<React.SetStateAction<Record<string, Artifact>>>;
  setActiveArtifactId: React.Dispatch<React.SetStateAction<string | null>>;
  tier: Tier;
  settings: Settings;
  profile: Profile | null;
  authUser: AuthUser | null;
  toast: (m: string) => void;
}) {
  const {
    sessionsRef,
    activeIdRef,
    streamsRef,
    aborts,
    setStreams,
    setSessions,
    setActiveId,
    setArtifacts,
    setActiveArtifactId,
    tier,
    settings,
    profile,
    authUser,
    toast,
  } = opts;

  // Monotonic generation counter: regenerate() reuses the message uid, so a
  // late followups() result from generation N must not land on generation N+1.
  const genRef = useRef(0);

  const patchMsg = useCallback(
    (sid: string, mu: string, patch: Partial<LucaMessage>) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sid
            ? {
                ...s,
                updatedAt: Date.now(),
                messages: s.messages.map((m) => (m.uid === mu ? { ...m, ...patch } : m)),
              }
            : s
        )
      );
    },
    [setSessions]
  );

  const patchRound = useCallback(
    (sid: string, mu: string, rid: string, patch: Partial<ToolRound>) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sid
            ? {
                ...s,
                updatedAt: Date.now(),
                messages: s.messages.map((m) => {
                  if (m.uid !== mu) return m;
                  const rounds = m.toolRounds || [];
                  return {
                    ...m,
                    toolRounds: rounds.some((r) => r.id === rid)
                      ? rounds.map((r) => (r.id === rid ? { ...r, ...patch } : r))
                      : [...rounds, { id: rid, name: "web_search", query: "", sources: [], status: "running" as const, ...patch }],
                  };
                }),
              }
            : s
        )
      );
    },
    [setSessions]
  );

  const commitVersion = useCallback(
    (sid: string, mu: string, text: string) => {
      if (!text.trim()) return;
      setSessions((prev) =>
        prev.map((s) =>
          s.id !== sid
            ? s
            : {
                ...s,
                messages: s.messages.map((m) => {
                  if (m.uid !== mu) return m;
                  const versions = [...(m.versions || [])];
                  if (!versions.length || versions[versions.length - 1] !== text) versions.push(text);
                  return { ...m, versions, versionIndex: versions.length - 1 };
                }),
              }
        )
      );
    },
    [setSessions]
  );

  const runStream = useCallback(
    async (sid: string, auid: string, history: ChatMsg[], userText: string, t: Tier) => {
      const controller = new AbortController();
      aborts.current.set(sid, controller);
      const genId = ++genRef.current;
      setStreams((p) => ({ ...p, [sid]: auid }));
      let acc = "",
        reasoning = "";
      const startedAt = Date.now();
      let firstContentAt: number | null = null;
      try {
        const gen = streamChat({ tier: t, history, settings, profile, auth: authUser, signal: controller.signal });
        for await (const ev of gen as AsyncGenerator<EngineEvent>) {
          switch (ev.kind) {
            case "reset":
              reasoning = "";
              patchMsg(sid, auid, { reasoning: "", toolRounds: [] });
              break;
            case "meta":
              patchMsg(sid, auid, { modelMeta: { model: ev.model, provider: ev.provider, pinned: ev.pinned } });
              break;
            case "reasoning":
              reasoning += ev.text;
              patchMsg(sid, auid, { reasoning });
              break;
            case "stage":
              patchMsg(sid, auid, { stage: ev.stage, stageLabel: ev.label });
              break;
            case "sources":
              patchMsg(sid, auid, { sources: ev.sources });
              break;
            case "search-info":
              patchMsg(sid, auid, { searchInfo: { query: ev.query, reason: ev.reason, count: ev.count } });
              break;
            case "content":
              if (!firstContentAt) firstContentAt = Date.now();
              acc += ev.text;
              patchMsg(sid, auid, { content: acc });
              break;
            case "tool-start":
              patchRound(sid, auid, ev.roundId, { name: ev.name, query: ev.query, status: "running" });
              break;
            case "tool-end":
              patchRound(sid, auid, ev.roundId, {
                sources: ev.sources,
                status: "done",
                ms: ev.ms,
                ...(ev.result ? { result: ev.result } : {}),
              });
              break;
            case "error":
              patchMsg(sid, auid, { error: ev.message });
              break;
            case "artifact_start": {
              setArtifacts((prev) => {
                const ex = prev[ev.id];
                if (ex)
                  return {
                    ...prev,
                    [ev.id]: { ...ex, versions: [...ex.versions, { version: ex.versions.length + 1, content: "", createdAt: new Date().toISOString() }] },
                  };
                return {
                  ...prev,
                  [ev.id]: {
                    id: ev.id,
                    artifactType: ev.artifactType as Artifact["artifactType"],
                    title: ev.title,
                    versions: [{ version: 1, content: "", createdAt: new Date().toISOString() }],
                  },
                };
              });
              // Link the artifact to its message so it survives reloads (Phase 6e).
              {
                const cur = sessionsRef.current.find((s) => s.id === sid);
                const curMsg = cur?.messages.find((m) => m.uid === auid);
                const ids =
                  curMsg?.artifactIds && curMsg.artifactIds.includes(ev.id) ? curMsg.artifactIds : [...(curMsg?.artifactIds || []), ev.id];
                patchMsg(sid, auid, { artifactIds: ids });
              }
              // Don't yank a full-screen panel over a still-arriving answer on
              // phones; desktop keeps the auto-open.
              if (window.matchMedia("(min-width: 801px)").matches) setActiveArtifactId(ev.id);
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
            case "artifact_end":
              break;
            case "done":
              break;
          }
        }
        patchMsg(sid, auid, {
          streaming: false,
          thinkingMs: reasoning ? (firstContentAt || Date.now()) - startedAt : undefined,
          elapsedMs: Date.now() - startedAt,
        });
        commitVersion(sid, auid, acc);
        // Follow-up chips: only for clean completions with substance. Applied
        // only if this message is still the latest (conversation didn't move on).
        if (acc.trim().length > 40 && !controller.signal.aborted) {
          void followups(acc).then((sugs) => {
            if (genId !== genRef.current) return; // superseded by a newer generation
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
          patchMsg(sid, auid, { streaming: false, interrupted: true, elapsedMs: Date.now() - startedAt });
          commitVersion(sid, auid, acc);
        } else {
          const stalled = e instanceof DOMException && e.name === "TimeoutError";
          const raw = e instanceof Error ? e.message : "Something went wrong.";
          patchMsg(sid, auid, {
            streaming: false,
            elapsedMs: Date.now() - startedAt,
            error: stalled
              ? "Stream stalled — the backend stopped responding. Hit Retry to continue."
              : /failed to fetch|networkerror|load failed|typeerror/i.test(raw)
                ? "Backend not reachable — try again in a moment."
                : raw,
          });
          commitVersion(sid, auid, acc);
        }
      } finally {
        // Clear only this chat's slot — other chats keep streaming untouched.
        aborts.current.delete(sid);
        setStreams((p) => {
          if (!(sid in p)) return p;
          const n = { ...p };
          delete n[sid];
          return n;
        });
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
            if (hist.length === 0)
              hist.push({ role: "user", content: userText }, { role: "assistant", content: acc.slice(0, 500) });
            const title = (await nameChatFromMessages(hist)) || titleFromMessage(lastUserText);
            // Never overwrite a title the user chose themselves.
            if (title) setSessions((p) => p.map((x) => (x.id === sid && !x.userNamed ? { ...x, title } : x)));
          } catch {
            /* background naming must never break the chat turn */
          }
        })();
      }
    },
    [settings, profile, authUser, patchMsg, patchRound, commitVersion, aborts, setStreams, setArtifacts, setActiveArtifactId, setSessions, sessionsRef, activeIdRef]
  );

  // Model choice is PER-CHAT and persists on the chat record. New chats
  // inherit the global default; the composer control edits the open chat.
  const sendMessage = useCallback(
    (text: string, attachments: Attachment[]) => {
      let sid = activeIdRef.current;
      // Only the actively-streaming chat is locked; other chats (or a new one)
      // can always send — the backend streams them independently.
      if (sid && streamsRef.current[sid]) return;
      let baseMsgs: LucaMessage[] = [];
      const liveSession = sid ? sessionsRef.current.find((s) => s.id === sid) || null : null;
      if (!sid || !liveSession) {
        sid = uid();
        const chatTier = tier;
        setSessions((p) => {
          // 500-chat cap: evicting the oldest is silent data loss without this.
          if (p.length >= 500) toast("Chat list is full — the oldest chat was removed.");
          return [{ id: sid!, title: "New chat", createdAt: Date.now(), updatedAt: Date.now(), tier: chatTier, messages: [] }, ...p].slice(0, 500);
        });
        setActiveId(sid);
      } else baseMsgs = liveSession.messages;
      const sendTier = liveSession?.tier || tier;
      const userMsg: LucaMessage = { uid: uid(), role: "user", content: text, ts: Date.now(), attachments: attachments.length ? attachments : undefined };
      const asstMsg: LucaMessage = { uid: uid(), role: "assistant", content: "", ts: Date.now(), tier: sendTier, streaming: true, startedAt: Date.now(), toolRounds: [] };
      const id = sid;
      setSessions((p) => p.map((s) => (s.id === id ? { ...s, updatedAt: Date.now(), messages: [...s.messages, userMsg, asstMsg] } : s)));
      // New turn must carry its images as image_url parts (not a plain string),
      // otherwise the thumbnail renders locally but the model never receives them.
      // Documents/code ride along as inlined text blocks via docBlockFor.
      const newImgs = attachments.filter((a) => a.type.startsWith("image/"));
      const docBlock = docBlockFor(attachments);
      const fullText = text + (docBlock ? "\n\n" + docBlock : "");
      const newUserTurn: ChatMsg = newImgs.length
        ? {
            role: "user",
            content: [
              { type: "text", text: fullText + "\n[Attached: " + attachments.filter((a) => a.type.startsWith("image/")).map((a) => a.name).join(", ") + "]" },
              ...newImgs.map((a) => ({ type: "image_url", image_url: { url: a.dataUrl } })),
            ],
          }
        : { role: "user", content: fullText };
      void runStream(id, asstMsg.uid, [...toHistory(baseMsgs), newUserTurn], text, sendTier);
    },
    [tier, runStream, setSessions, setActiveId, toast, sessionsRef, activeIdRef, streamsRef]
  );

  const setChatTier = useCallback(
    (sid: string, t: Tier) => {
      setSessions((p) => p.map((s) => (s.id === sid ? { ...s, tier: t } : s)));
    },
    [setSessions]
  );

  // Streams are per-chat on the backend (switching chats doesn't abort), so
  // only block actions in the chat that's actually streaming — never others.
  // (streamsRef mirror is defined with the stream map above.)
  const regenerate = useCallback(
    (sid: string, mu: string) => {
      if (streamsRef.current[sid]) return;
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
      const rt = s.tier || tier;
      const fresh: LucaMessage = {
        uid: mu,
        role: "assistant",
        content: "",
        ts: Date.now(),
        tier: rt,
        streaming: true,
        startedAt: Date.now(),
        toolRounds: [],
        versions: prev.length ? prev : undefined,
        versionIndex: undefined,
      };
      setSessions((p) => p.map((x) => (x.id === sid ? { ...x, updatedAt: Date.now(), messages: [...before, fresh] } : x)));
      void runStream(sid, mu, toHistory(before), lastUser.content, rt);
    },
    [tier, runStream, setSessions, sessionsRef, streamsRef]
  );

  const editAndResend = useCallback(
    (sid: string, mu: string, text: string) => {
      if (streamsRef.current[sid]) return;
      const s = sessionsRef.current.find((x) => x.id === sid);
      if (!s) return;
      const idx = s.messages.findIndex((m) => m.uid === mu);
      if (idx < 0) return;
      const before = s.messages.slice(0, idx);
      const orig = s.messages[idx];
      if (!orig || !orig.uid) return;
      const userMsg: LucaMessage = { ...orig, content: text, ts: Date.now() };
      const et = s.tier || tier;
      const asstMsg: LucaMessage = { uid: uid(), role: "assistant", content: "", ts: Date.now(), tier: et, streaming: true, startedAt: Date.now(), toolRounds: [] };
      setSessions((p) => p.map((x) => (x.id === sid ? { ...x, updatedAt: Date.now(), messages: [...before, userMsg, asstMsg] } : x)));
      const editImgs = (userMsg.attachments || []).filter((a) => a.type.startsWith("image/"));
      const editDocBlock = docBlockFor(userMsg.attachments);
      const editFullText = text + (editDocBlock ? "\n\n" + editDocBlock : "");
      const editUserTurn: ChatMsg = editImgs.length
        ? { role: "user", content: [{ type: "text", text: editFullText }, ...editImgs.map((a) => ({ type: "image_url", image_url: { url: a.dataUrl } }))] }
        : { role: "user", content: editFullText };
      void runStream(sid, asstMsg.uid, [...toHistory(before), editUserTurn], text, et);
    },
    [tier, runStream, setSessions, sessionsRef, streamsRef]
  );

  // Version switcher: re-added in Phase 6 with working controls (was threaded but never called).
  const setVersion = useCallback(
    (sid: string, mu: string, i: number) => {
      setSessions((p) => p.map((s) => (s.id !== sid ? s : { ...s, messages: s.messages.map((m) => (m.uid === mu ? { ...m, versionIndex: i } : m)) })));
    },
    [setSessions]
  );

  return { sendMessage, regenerate, editAndResend, setVersion, setChatTier, patchMsg };
}
