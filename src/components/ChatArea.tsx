import { Suspense, lazy, memo, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, FileText, Globe, Pencil, RefreshCw, RotateCcw } from "lucide-react";
const Markdown = lazy(() => import("./Markdown"));
import { copyText } from "../lib/store";
import type { LucaMessage, Session, Settings, Profile } from "../lib/store";

interface Props {
  session: Session | null; profile: Profile | null; settings: Settings;
  onSuggestion: (t: string) => void;
  onRegenerate: (sid: string, uid: string) => void;
  onEditResend: (sid: string, uid: string, text: string) => void;
  onVersion: (sid: string, uid: string, i: number) => void;
  onToast: (m: string) => void;
  onEditDraft: (text: string) => void;
  onOpenArtifact: (id: string) => void;
}

function ErrorState({ modelLabel, onRetry, onEditLastMessage }: { modelLabel: string; onRetry: () => void; onEditLastMessage: () => void }) {
  return (
    <div className="error-state">
      <p className="error-state__message">{modelLabel} didn't return a response.</p>
      <div className="error-state__actions">
        <button className="error-action" onClick={onRetry}>
          <RotateCcw size={15} strokeWidth={1.75} />
          Retry
        </button>
        <button className="error-action" onClick={onEditLastMessage}>
          <Pencil size={15} strokeWidth={1.75} />
          Edit message
        </button>
      </div>
    </div>
  );
}

export function ThinkingIndicator({ currentLabel, isDone, reasoningTrace }: { currentLabel: string; isDone: boolean; reasoningTrace: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    if (isDone) return;
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [isDone]);
  return (
    <div className="thinking">
      <button className="thinking__header" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        <span className={`thinking-label ${isDone ? "thinking-label--done" : ""}`}>{currentLabel}</span>
        <span className="thinking__meta">
          {!isDone && <>{elapsed}s</>}
          <ChevronDown size={14} className={`thinking__chevron ${expanded ? "thinking__chevron--open" : ""}`} />
        </span>
      </button>
      {expanded && reasoningTrace.length > 0 && (
        <div className="thinking__trace">{reasoningTrace.map((line, i) => <p key={i} className="thinking__trace-line">{line}</p>)}</div>
      )}
    </div>
  );
}

function Thinking({ reasoning, streaming, thinkingMs, stageLabel }: { reasoning?: string; streaming?: boolean; thinkingMs?: number; stageLabel?: string }) {
  if (streaming) {
    const trace = reasoning ? reasoning.split(/\n+/).filter(Boolean) : [];
    const label = stageLabel || "Thinking…";
    return <ThinkingIndicator currentLabel={label} isDone={false} reasoningTrace={trace} />;
  }
  if (!reasoning) return null;
  const secs = Math.max(1, Math.round((thinkingMs || 1000) / 1000));
  const trace = reasoning.split(/\n+/).filter(Boolean);
  // Done state: use the shimmer indicator in its completed form
  return <ThinkingIndicator currentLabel={`Thought for ${secs}s`} isDone={true} reasoningTrace={trace} />;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Re-parse streaming text at ~30fps instead of per token.
function useThrottled<T>(value: T, ms = 33): T {
  const [v, setV] = useState(value);
  const last = useRef(0);
  useEffect(() => {
    if (ms <= 0) { setV(value); return; }
    const now = Date.now();
    const wait = Math.max(0, ms - (now - last.current));
    const id = window.setTimeout(() => { last.current = Date.now(); setV(value); }, wait);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

const AssistantMsg = memo(function AssistantMsg({ msg, session, isLast, onRegenerate, onVersion, onToast, onSelect, onEditDraft, onOpenArtifact }: {
  msg: LucaMessage; session: Session; isLast: boolean;
  onRegenerate: (sid: string, uid: string) => void;
  onVersion: (sid: string, uid: string, i: number) => void;
  onOpenArtifact: (id: string) => void;
  onToast: (m: string) => void;
  onSelect: (text: string) => void;
  onEditDraft: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const versions = msg.versions || [];
  const showVersion = versions.length > 1 && !msg.streaming;
  const idx = msg.versionIndex ?? versions.length - 1;
  const display = showVersion ? versions[idx] : msg.content;
  // Throttle only while streaming; completed messages render immediately.
  const shown = useThrottled(display ?? msg.content, msg.streaming ? 33 : 0);
  const cited = (() => {
    if (!msg.sources?.length || !shown) return [];
    const seen = new Set<number>();
    const re = /\[(\d{1,2})\](?!\()/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(shown))) seen.add(Number(m[1]));
    return msg.sources.filter((s) => seen.has(s.id));
  })();
  const isContentError = !!shown && /The model didn't return a response|All models are rate-limited/i.test(shown.trim());
  const copyThis = async () => { if (await copyText(shown || msg.content)) { setCopied(true); onToast("Copied"); setTimeout(() => setCopied(false), 1400); } };
  // While streaming with no content yet: thinking indicator only.
  if (msg.streaming && !display) {
    return (
      <div className="msg msg-luca">
        <div className="who">Luca</div>
        <Thinking reasoning={msg.reasoning} streaming={msg.streaming} thinkingMs={msg.thinkingMs} stageLabel={msg.stageLabel} />
      </div>
    );
  }
  return (
    <div className="msg msg-luca" aria-busy={msg.streaming || undefined}>
      <div className="who">Luca</div>
        {!msg.streaming && (
          <Thinking reasoning={msg.reasoning} streaming={msg.streaming} thinkingMs={msg.thinkingMs} stageLabel={msg.stageLabel} />
        )}

        {isContentError ? null : shown ? (
          <div className="bubble">
            <Suspense fallback={<div style={{ whiteSpace: "pre-wrap" }}>{shown}</div>}><Markdown text={shown} sources={msg.sources} /></Suspense>
            <button className="copy-btn" onClick={copyThis} aria-label="Copy message" title="Copy">
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
        ) : (!msg.reasoning && msg.streaming ? <span className="typing" aria-hidden="true"><i /><i /><i /></span> : null)}
        <div className="msg-time">{fmtTime(msg.ts)}</div>
        {cited.length > 0 && (
          <div className="sources-pill-wrap">
              <button className="sources-pill" onClick={() => setShowSources(!showSources)}>
                <Globe size={14} />
                <span>{cited.length} web {cited.length === 1 ? "page" : "pages"}</span>
              </button>
            {showSources && (
              <div className="sources-dropdown">
                {cited.map((s) => (
                  <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="source-row">
                    <span className="num">{s.id}</span>
                    <span className="domain">{s.domain}</span>
                    <span className="title">{s.title}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
        {msg.streaming && shown ? <span className="cursor" aria-hidden="true" /> : null}
        {(!!msg.error || isContentError) && !msg.streaming && (() => {
          const modelLabel = msg.tier ? `Luca ${msg.tier === "flash" ? "Flash" : "Pro"}` : "Luca";
          const lastUserText = (() => {
            const idx = session.messages.findIndex((m) => m.uid === msg.uid);
            for (let i = idx - 1; i >= 0; i--) { const m = session.messages[i]; if (m && m.role === "user") return m.content; }
            return session.messages.filter((m) => m.role === "user").slice(-1)[0]?.content || "";
          })();
          return (
            <ErrorState
              modelLabel={modelLabel}
              onRetry={() => onRegenerate(session.id, msg.uid)}
              onEditLastMessage={() => onEditDraft(lastUserText)}
            />
          );
        })()}
        {msg.interrupted && !msg.streaming && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Stopped.</span>
            <button className="mini-btn" onClick={() => onRegenerate(session.id, msg.uid)}>Retry</button>
          </div>
        )}
        {!msg.streaming && (shown || msg.error) && (
          <div className="msg-meta">
            {msg.tier && (
              <span className="model-tag" title={msg.modelMeta?.pinned ? "Admin-pinned model" : "Active model"}>
                <span className="model-dot" aria-hidden="true" />
                {msg.modelMeta?.pinned ? `${msg.modelMeta.provider}/${msg.modelMeta.model}` : `Luca ${msg.tier === "flash" ? "Flash" : "Pro"}`}
              </span>
            )}
            {!msg.streaming && msg.artifactIds && msg.artifactIds.length > 0 && (
              <span className="artifact-links">
                {msg.artifactIds.map((aid) => (
                  <button key={aid} className="mini-btn" onClick={() => onOpenArtifact(aid)}>View artifact</button>
                ))}
              </span>
            )}
            {showVersion && (
              <span className="version-nav">
                <button className="icon-btn" disabled={idx === 0}
                  onClick={() => onVersion(session.id, msg.uid, idx - 1)} aria-label="Previous version">
                  <ChevronLeft size={13} />
                </button>
                <span aria-live="polite">{idx + 1}/{versions.length}</span>
                <button className="icon-btn" disabled={idx === versions.length - 1}
                  onClick={() => onVersion(session.id, msg.uid, idx + 1)} aria-label="Next version">
                  <ChevronRight size={13} />
                </button>
              </span>
            )}
            <span className="msg-actions">
              <button className="icon-btn" aria-label="Regenerate" onClick={() => onRegenerate(session.id, msg.uid)}>
                <RefreshCw size={13} />
              </button>
            </span>
          </div>
        )}
        {isLast && !msg.streaming && msg.followups && msg.followups.length > 0 && (
          <div className="followups">
            {msg.followups.slice(0, 3).map((s) => (
              <button key={s} className="followup-chip" onClick={() => onSelect(s)}>{s}</button>
            ))}
          </div>
        )}
    </div>
  );
}, (a, b) => a.msg === b.msg && a.isLast === b.isLast && a.session.id === b.session.id);
// patchMsg returns new objects only for the touched message, so identity
// comparison is exact and cheap. session.id covers regenerate targets.

const UserMsg = memo(function UserMsg({ msg, session, onEditResend, onToast }: {
  msg: LucaMessage; session: Session;
  onEditResend: (sid: string, uid: string, text: string) => void;
  onToast: (m: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);
  const [copied, setCopied] = useState(false);
  const copyThis = async () => { if (await copyText(msg.content)) { setCopied(true); onToast("Copied"); setTimeout(() => setCopied(false), 1400); } };
  if (editing) {
    return (
      <div className="msg msg-user">
        <div style={{ maxWidth: "85%", width: "100%" }}>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} className="edit-textarea"
            style={{ width: "100%", background: "var(--s1)", border: "1px solid var(--line2)", borderRadius: 12, padding: "10px 14px", resize: "vertical", color: "var(--txt)" }} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button className="mini-btn" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn-primary" style={{ width: "auto", padding: "6px 18px", fontSize: 12 }} onClick={() => { if (draft.trim()) { onEditResend(session.id, msg.uid, draft.trim()); setEditing(false); } }}>Save</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="msg msg-user">
      <div className="bubble">
        <Suspense fallback={msg.content}><Markdown text={msg.content} /></Suspense>
        <button className="copy-btn" onClick={copyThis} aria-label="Copy message" title="Copy">
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
      {(msg.attachments?.length || 0) > 0 && (
        <div className="att-chips">
          {msg.attachments?.filter((a) => a.type.startsWith("image/")).map((a) => (
            <img key={a.id} className="msg-thumb" src={a.dataUrl} alt={a.name} />
          ))}
          {msg.attachments?.filter((a) => !a.type.startsWith("image/")).map((a) => (
            <span key={a.id} className="chip"><FileText size={11} />{a.name}</span>
          ))}
        </div>
      )}
      <div className="msg-time">{fmtTime(msg.ts)}</div>
      <div className="msg-meta hover-only">
        <span className="msg-actions">
          <button className="icon-btn" aria-label="Edit and resend" onClick={() => { setDraft(msg.content); setEditing(true); }}>
            <Pencil size={13} />
          </button>
        </span>
      </div>
    </div>
  );
}, (a, b) => a.msg === b.msg && a.session.id === b.session.id);

export default function ChatArea({ session, settings, onSuggestion, onRegenerate, onEditResend, onVersion, onToast, onEditDraft, onOpenArtifact }: Props) {
  const threadRef = useRef<HTMLDivElement>(null);
  const prevKey = useRef("");
  // Scroll-down pill: visible only when the user has scrolled well above the
  // latest messages. Tapping glides back to the bottom.
  const [stuck, setStuck] = useState(false);
  const onThreadScroll = () => {
    const el = threadRef.current;
    if (!el) return;
    setStuck(el.scrollHeight - el.scrollTop - el.clientHeight > 400);
  };
  const jumpToBottom = () => {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  };
  useEffect(() => {
    const el = threadRef.current;
    if (!el || !settings.autoScroll || !session) return;
    const last = session.messages[session.messages.length - 1];
    const key = session.messages.length + ":" + (last ? last.content.length : 0) + ":" + (last?.streaming ? "1" : "0");
    if (key === prevKey.current) return;
    prevKey.current = key;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom || (last && last.role === "assistant" && last.streaming)) {
      el.scrollTop = el.scrollHeight;
      setStuck(false);
    }
  }, [session, settings.autoScroll]);
  // Long threads (>60 messages) render only the visible window. Dynamic
  // measurement handles wildly varying message heights; streaming growth
  // re-measures via ResizeObserver and the auto-scroll effect below sticks.
  const msgs = session?.messages ?? [];
  const useVirtual = msgs.length > 60;
  const virtualizer = useVirtualizer({
    count: msgs.length,
    getScrollElement: () => threadRef.current,
    estimateSize: () => 240,
    overscan: 6,
  });
  const renderMsg = (m: LucaMessage, i: number) => m.role === "user"
    ? <UserMsg key={m.uid} msg={m} session={session!} onEditResend={onEditResend} onToast={onToast} />
    : <AssistantMsg key={m.uid} msg={m} session={session!} isLast={i === msgs.length - 1} onRegenerate={onRegenerate} onVersion={onVersion} onToast={onToast} onSelect={onSuggestion} onEditDraft={onEditDraft} onOpenArtifact={onOpenArtifact} />;
  // Screen-reader announcements for streaming — never on the message text
  // itself (that would read every token).
  const streaming = msgs.some((m) => m.streaming);
  const wasStreaming = useRef(false);
  const [announce, setAnnounce] = useState("");
  useEffect(() => {
    if (streaming && !wasStreaming.current) setAnnounce("Luca is responding");
    else if (!streaming && wasStreaming.current) setAnnounce("Response complete");
    wasStreaming.current = streaming;
  }, [streaming]);
  if (!session || msgs.length === 0) {
    return null;
  }
  return (
    <div className="thread-wrap">
      <div aria-live="polite" aria-atomic="true" className="sr-only">{announce}</div>
      <div className="thread thread-in" key="thread" ref={threadRef} onScroll={onThreadScroll}><div className="thread-inner">
      {useVirtual ? (
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((v) => {
            const m = msgs[v.index];
            if (!m) return null;
            return (
              <div
                key={m.uid}
                data-index={v.index}
                ref={(el) => { if (el) virtualizer.measureElement(el); }}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${v.start}px)` }}
              >
                {renderMsg(m, v.index)}
              </div>
            );
          })}
        </div>
      ) : (
        msgs.map((m, i) => renderMsg(m, i))
      )}
      </div></div>
      {stuck && (
        <button className="jump-btn" onClick={jumpToBottom} aria-label="Scroll to latest messages">
          <ArrowDown size={17} />
        </button>
      )}
    </div>
  );
}
