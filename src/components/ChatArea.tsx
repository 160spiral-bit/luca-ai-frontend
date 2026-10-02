import { Suspense, lazy, memo, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, Check, ChevronLeft, ChevronRight, Copy, FileText, Globe, Pencil, RefreshCw, RotateCcw } from "lucide-react";
const Markdown = lazy(() => import("./Markdown"));
import ProcessView from "./ProcessView";
import { copyText } from "../lib/store";
import { fmtDur } from "../lib/format";
import type { LucaMessage, Session, Settings } from "../lib/store";

interface Props {
  session: Session | null; settings: Settings;
  onSuggestion: (t: string) => void;
  onRegenerate: (sid: string, uid: string) => void;
  onEditResend: (sid: string, uid: string, text: string) => void;
  onVersion: (sid: string, uid: string, i: number) => void;
  onToast: (m: string) => void;
  onEditDraft: (text: string) => void;
  onOpenArtifact: (id: string) => void;
  onPreviewHtml: (title: string, html: string) => void;
}

function ErrorState({ modelLabel, detail, onRetry, onEditLastMessage }: { modelLabel: string; detail?: string | null; onRetry: () => void; onEditLastMessage: () => void }) {
  return (
    <div className="error-state">
      <p className="error-state__message">{modelLabel} couldn't answer.</p>
      {detail ? <p className="error-state__detail">{detail}</p> : null}
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

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Wall-clock response time is shared (see lib/format.ts).

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

const AssistantMsg = memo(function AssistantMsg({ msg, session, isLast, onRegenerate, onVersion, onToast, onSelect, onEditDraft, onOpenArtifact, onPreviewHtml }: {
  msg: LucaMessage; session: Session; isLast: boolean;
  onRegenerate: (sid: string, uid: string) => void;
  onVersion: (sid: string, uid: string, i: number) => void;
  onOpenArtifact: (id: string) => void;
  onPreviewHtml: (title: string, html: string) => void;
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
  // Display trim: streaming often leaves trailing newlines that render as a
  // blank gap at the bottom of the bubble. Copy keeps full fidelity.
  const shownTrimmed = typeof shown === "string" ? shown.replace(/\s+$/, "") : shown;
  const copyThis = async () => { if (await copyText(shown || msg.content)) { setCopied(true); onToast("Copied"); setTimeout(() => setCopied(false), 1400); } };
  const dur = fmtDur(msg.elapsedMs ?? msg.thinkingMs);
  return (
    <div className="msg msg-luca" aria-busy={msg.streaming || undefined}>
      <div className="who">Luca</div>
        <ProcessView msg={msg} />

        {isContentError ? null : shown ? (
          <div className="bubble">
            <Suspense fallback={<div className="wrap-pre">{shownTrimmed}</div>}><Markdown text={shownTrimmed} sources={msg.sources} live={msg.streaming} /></Suspense>
          </div>
        ) : msg.stage === "image" ? (
          <div className="bubble">
            <div className="img-gen-skeleton" role="status" aria-label={msg.stageLabel || "Generating image"}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
              <span>{msg.stageLabel || "Generating image…"}</span>
            </div>
          </div>
        ) : null}
        <div className="msg-time">{fmtTime(msg.ts)}</div>
        {cited.length > 0 && (
          <div className="sources-pill-wrap">
              <button className="sources-pill" aria-expanded={showSources} aria-controls={`src-${msg.uid}`} onClick={() => setShowSources(!showSources)}>
                <Globe size={14} />
                <span>{cited.length} web {cited.length === 1 ? "page" : "pages"}</span>
              </button>
            {showSources && (
              <div className="sources-dropdown" id={`src-${msg.uid}`}>
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
            detail={msg.error}
            onRetry={() => onRegenerate(session.id, msg.uid)}
            onEditLastMessage={() => onEditDraft(lastUserText)}
          />
          );
        })()}
        {msg.interrupted && !msg.streaming && (
          <div className="stopped-row">
            <span className="stopped-text">Stopped.</span>
            <button className="mini-btn" onClick={() => onRegenerate(session.id, msg.uid)}>Retry</button>
          </div>
        )}
        {!msg.streaming && (shown || msg.error) && (
          <div className="msg-meta">
            <span className="msg-actions">
              <button className="icon-btn" aria-label="Copy message" title="Copy" onClick={copyThis}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
              <button className="icon-btn" aria-label="Regenerate" title="Regenerate" onClick={() => onRegenerate(session.id, msg.uid)}>
                <RefreshCw size={13} />
              </button>
            </span>
            {msg.tier && (
              <>
                <span className="msg-sep" aria-hidden="true">·</span>
                <span className="model-tag" title={msg.modelMeta?.pinned ? "Admin-pinned model" : "Active model"}>
                  {msg.modelMeta?.pinned ? `${msg.modelMeta.provider}/${msg.modelMeta.model}` : `Luca ${msg.tier === "flash" ? "Flash" : "Pro"}`}
                </span>
              </>
            )}
            {dur && (
              <>
                <span className="msg-sep" aria-hidden="true">·</span>
                <span className="msg-dur" title="Response time">{dur}</span>
              </>
            )}
            {!msg.streaming && msg.artifactIds && msg.artifactIds.length > 0 && (
              <span className="artifact-links">
                {msg.artifactIds.map((aid) => (
                  <button key={aid} className="mini-btn" onClick={() => onOpenArtifact(aid)}>View artifact</button>
                ))}
              </span>
            )}
            {!msg.streaming && shown && (() => {
              const m = /```html\n([\s\S]*?)```/.exec(shown);
              const html = m && m[1] ? m[1].trim() : "";
              if (html.length < 800) return null;
              return (
                <span className="artifact-links">
                  <button className="mini-btn" onClick={() => onPreviewHtml("HTML preview", html)}>Open preview</button>
                </span>
              );
            })()}
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
  // Display trim: composer newlines leave a trailing gap in the bubble.
  const displayContent = msg.content.replace(/\s+$/, "");
  if (editing) {
    return (
      <div className="msg msg-user">
        <div className="edit-wrap">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} className="edit-field"
             />
          <div className="edit-actions">
            <button className="mini-btn edit-cancel" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn-primary edit-save" onClick={() => { if (draft.trim()) { onEditResend(session.id, msg.uid, draft.trim()); setEditing(false); } }}>Save</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="msg msg-user">
      <div className="bubble">
        <div className="wrap-pre">{displayContent}</div>
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
          <button className="icon-btn" aria-label="Copy message" title="Copy" onClick={copyThis}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
          <button className="icon-btn" aria-label="Edit and resend" onClick={() => { setDraft(msg.content); setEditing(true); }}>
            <Pencil size={13} />
          </button>
        </span>
      </div>
    </div>
  );
}, (a, b) => a.msg === b.msg && a.session.id === b.session.id);

export default function ChatArea({ session, settings, onSuggestion, onRegenerate, onEditResend, onVersion, onToast, onEditDraft, onOpenArtifact, onPreviewHtml }: Props) {
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
  // Latch once set: flipping between static and virtualized layout at exactly
  // 60 messages mid-conversation discards scroll position and the auto-scroll
  // anchor. A ref persists the decision for the session's lifetime; the effect
  // below flips it (never during render) and mirrors to state for rendering.
  const virtualLatched = useRef(false);
  const [useVirtual, setUseVirtual] = useState(false);
  useEffect(() => {
    if (msgs.length > 60 && !virtualLatched.current) {
      virtualLatched.current = true;
      setUseVirtual(true);
    }
  }, [msgs.length]);
  const virtualizer = useVirtualizer({
    count: msgs.length,
    getScrollElement: () => threadRef.current,
    estimateSize: () => 240,
    overscan: 6,
  });
  const renderMsg = (m: LucaMessage, i: number) => m.role === "user"
    ? <UserMsg key={m.uid} msg={m} session={session!} onEditResend={onEditResend} onToast={onToast} />
    : <AssistantMsg key={m.uid} msg={m} session={session!} isLast={i === msgs.length - 1} onRegenerate={onRegenerate} onVersion={onVersion} onToast={onToast} onSelect={onSuggestion} onEditDraft={onEditDraft} onOpenArtifact={onOpenArtifact} onPreviewHtml={onPreviewHtml} />;
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
        <div className="virt-shell" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((v) => {
            const m = msgs[v.index];
            if (!m) return null;
            return (
              <div
                key={m.uid}
                data-index={v.index}
                ref={(el) => { if (el) virtualizer.measureElement(el); }}
                className="virt-item"
                style={{ transform: `translateY(${v.start}px)` }}
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
