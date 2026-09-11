import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, Check, ChevronDown, Copy, Pencil, RefreshCw, RotateCcw } from "lucide-react";
const Markdown = lazy(() => import("./Markdown"));
import Logo from "./Logo";
import { copyText } from "../lib/store";
import type { LucaMessage, Session, Settings, Profile, Source, SearchInfo } from "../lib/store";

const SEARCH_WHY: Record<string, string> = {
  explicit_search_request: "You asked me to look this up.",
  temporal_language: "Your question is about something current.",
  time_sensitive_subject: "This topic changes over time.",
  user_requests_evidence: "You asked for sourced evidence.",
  high_stakes_factual: "This needs verified facts.",
  current_ownership: "This asks who currently holds something.",
  recent_events: "This is about recent events.",
  entity_identification: "Identifying unfamiliar names first.",
  creator_lookup: "Looking up who made this.",
};

function SearchDisclosure({ info, sources }: { info: SearchInfo; sources?: Source[] }) {
  const [open, setOpen] = useState(true);
  const [inner, setInner] = useState(false);
  return (
    <div className="search-disclosure">
      <button className="outer-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Searched the web
        <ChevronDown size={14} className="thought-chev" style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }} />
      </button>
      {open && (
        <div className="outer-body">
          <p className="reasoning">{SEARCH_WHY[info.reason] || "Checking live information."}</p>
          <button className="inner-toggle" onClick={() => setInner((v) => !v)} aria-expanded={inner}>
            <span>Results for “{info.query}” ({info.count})</span>
            <ChevronDown size={13} className="thought-chev" style={{ transform: inner ? "rotate(0deg)" : "rotate(-90deg)" }} />
          </button>
          {inner && (
            <div className="inner-body">
              {(sources || []).map((s) => (
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
    </div>
  );
}

// One-line subtitle derived from the actual reasoning content of this turn —
// first substantial sentence, capped at 12 words. No category branching.
function thoughtSubtitle(reasoning?: string): string | null {
  if (!reasoning) return null;
  const flat = reasoning.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  const first = flat.split(/(?<=[.!?\n])\s+/).map((s) => s.trim()).find((s) => s.split(/\s+/).length >= 3);
  if (!first) return null;
  const words = first.replace(/^[•\-*#> ]+/, "").split(/\s+/).slice(0, 12);
  return words.join(" ") + (first.split(/\s+/).length > 12 ? "…" : "");
}

interface Props {
  session: Session | null; profile: Profile | null; settings: Settings;
  onSuggestion: (t: string) => void;
  onRegenerate: (sid: string, uid: string) => void;
  onEditResend: (sid: string, uid: string, text: string) => void;
  onVersion: (sid: string, uid: string, i: number) => void;
  onToast: (m: string) => void;
  onEditDraft: (text: string) => void;
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

const SUGGESTIONS = ["Create an image of a city at sunset", "Explain a tricky idea simply", "Help me write better code"];

function ThinkingLabel({ label }: { label: string }) {
  const [displayed, setDisplayed] = useState(label);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    if (label === displayed) return;
    setFading(true);
    const t = window.setTimeout(() => {
      setDisplayed(label);
      setFading(false);
    }, 150);
    return () => window.clearTimeout(t);
  }, [label, displayed]);
  useEffect(() => { if (!displayed && label) setDisplayed(label); }, [label, displayed]);
  if (!displayed) return null;
  return <span className={`thinking-status ${fading ? "thinking-status--fading" : ""}`}>{displayed}</span>;
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
        <span className="thinking__meta">{elapsed}s<ChevronDown size={14} className={`thinking__chevron ${expanded ? "thinking__chevron--open" : ""}`} /></span>
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

function AssistantMsg({ msg, session, isLast, onRegenerate, onVersion, onToast, onSelect, onEditDraft }: {
  msg: LucaMessage; session: Session; isLast: boolean;
  onRegenerate: (sid: string, uid: string) => void;
  onVersion: (sid: string, uid: string, i: number) => void;
  onToast: (m: string) => void;
  onSelect: (text: string) => void;
  onEditDraft: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const versions = msg.versions || [];
  const showVersion = versions.length > 1 && !msg.streaming;
  const idx = msg.versionIndex ?? versions.length - 1;
  const display = showVersion ? versions[idx] : msg.content;
  const cited = (() => {
    if (!msg.sources?.length || !display) return [];
    const seen = new Set<number>();
    const re = /\[(\d{1,2})\](?!\()/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(display))) seen.add(Number(m[1]));
    return msg.sources.filter((s) => seen.has(s.id));
  })();
  const isContentError = !!display && /The model didn't return a response|All models are rate-limited/i.test(display.trim());
  // While streaming with no content yet: ONLY the thinking indicator (single icon, no avatar).
  if (msg.streaming && !display) {
    return (
      <div className="msg">
        <div className="msg-body">
          <Thinking reasoning={msg.reasoning} streaming={msg.streaming} thinkingMs={msg.thinkingMs} stageLabel={msg.stageLabel} />
        </div>
      </div>
    );
  }
  return (
    <div className="msg">
      {!msg.reasoning && <span className="msg-avatar plain"><Logo size={16} /></span>}
      <div className="msg-body">
        {!msg.streaming && (
          <Thinking reasoning={msg.reasoning} streaming={msg.streaming} thinkingMs={msg.thinkingMs} stageLabel={msg.stageLabel} />
        )}
        {msg.toolRounds?.map((r) => (
          <div key={r.id} style={{ fontSize: 12.5, color: "var(--ink-3)", marginBottom: 8 }}>
            Searched the web{r.query ? ` — “${r.query}”` : ""}{r.status === "done" && r.ms != null ? ` (${(r.ms / 1000).toFixed(1)}s)` : "…"}
          </div>
        ))}
        {msg.searchInfo && <SearchDisclosure info={msg.searchInfo} sources={msg.sources} />}
        {isContentError ? null : display ? <Suspense fallback={<div style={{ whiteSpace: "pre-wrap" }}>{display}</div>}><Markdown text={display} sources={msg.sources} /></Suspense> : (!msg.reasoning && msg.streaming ? <span className="dots"><span /><span /><span /></span> : null)}
        {cited.length > 0 && (
          <div className="sources">
            <p className="sources-label">Sources</p>
            {cited.map((s) => (
              <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="source-row">
                <span className="num">{s.id}</span>
                <span className="domain">{s.domain}</span>
                <span className="title">{s.title}</span>
              </a>
            ))}
          </div>
        )}
        {msg.streaming && display ? <span className="cursor" aria-hidden="true" /> : null}
        {(!!msg.error || isContentError) && !msg.streaming && (() => {
          const modelLabel = msg.tier ? `Luca ${msg.tier === "flash" ? "Flash" : "Pro"}` : "Luca";
          const lastUserText = (() => {
            const idx = session.messages.findIndex((m) => m.uid === msg.uid);
            for (let i = idx - 1; i >= 0; i--) if (session.messages[i].role === "user") return session.messages[i].content;
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
        {!msg.streaming && (display || msg.error) && (
          <div className="msg-meta">
            {msg.tier && (
              <span className="model-tag" title={msg.modelMeta?.pinned ? "Admin-pinned model" : "Active model"}>
                <span className="model-dot" aria-hidden="true" />
                {msg.modelMeta?.pinned ? `${msg.modelMeta.provider}/${msg.modelMeta.model}` : `Luca ${msg.tier === "flash" ? "Flash" : "Pro"}`}
              </span>
            )}
            {showVersion && <span>v{idx + 1}/{versions.length}</span>}
            <span className="msg-actions">
              <button className="icon-btn" style={{ width: 26, height: 26 }} aria-label="Copy" onClick={async () => { if (await copyText(display)) { setCopied(true); onToast("Copied"); setTimeout(() => setCopied(false), 1400); } }}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
              <button className="icon-btn" style={{ width: 26, height: 26 }} aria-label="Regenerate" onClick={() => onRegenerate(session.id, msg.uid)}>
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
    </div>
  );
}

function UserMsg({ msg, session, onEditResend }: {
  msg: LucaMessage; session: Session;
  onEditResend: (sid: string, uid: string, text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);
  const [copied, setCopied] = useState(false);
  if (editing) {
    return (
      <div className="msg user">
        <div className="msg-body" style={{ maxWidth: "85%" }}>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3}
            style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--line-strong)", borderRadius: 12, padding: "10px 14px", fontSize: 15, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button className="mini-btn" style={{ border: "1px solid var(--line)", borderRadius: 999, padding: "6px 14px", fontSize: 12 }} onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn-primary" style={{ width: "auto", padding: "6px 18px", fontSize: 12 }} onClick={() => { if (draft.trim()) { onEditResend(session.id, msg.uid, draft.trim()); setEditing(false); } }}>Save</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="msg user">
      <div className="msg-body" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
        {msg.attachments?.filter((a) => a.type.startsWith("image/")).map((a) => (
          <img key={a.id} src={a.dataUrl} alt={a.name} style={{ height: 80, borderRadius: 12, border: "1px solid var(--line)", marginBottom: 8, objectFit: "cover" }} />
        ))}
        <div className="msg-bubble"><Suspense fallback={msg.content}><Markdown text={msg.content} /></Suspense></div>
        <div className="msg-meta">
          <span className="msg-actions">
            <button className="icon-btn" style={{ width: 26, height: 26 }} aria-label="Copy" onClick={async () => { if (await copyText(msg.content)) { setCopied(true); setTimeout(() => setCopied(false), 1400); } }}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <button className="icon-btn" style={{ width: 26, height: 26 }} aria-label="Edit and resend" onClick={() => { setDraft(msg.content); setEditing(true); }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ChatArea({ session, profile, settings, onSuggestion, onRegenerate, onEditResend, onVersion, onToast }: Props) {
  void profile;
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
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
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
  if (!session || session.messages.length === 0) {
    return (
      <div className="thread" key="empty"><div className="thread-inner">
        <div className="empty-state">
          <span className="empty-icon"><Logo size={26} /></span>
          <h1>Ready when you are.</h1>
          <p className="subtitle">Ask anything — or start with one of these.</p>
          <div className="chips">
            {SUGGESTIONS.map((s) => <button key={s} onClick={() => onSuggestion(s)}>{s}</button>)}
          </div>
        </div>
      </div></div>
    );
  }
  return (
    <div className="thread-wrap">
      <div className="thread thread-in" key="thread" ref={threadRef} onScroll={onThreadScroll}><div className="thread-inner">
      {session.messages.map((m, i) => m.role === "user"
        ? <UserMsg key={m.uid} msg={m} session={session} onEditResend={onEditResend} />
        : <AssistantMsg key={m.uid} msg={m} session={session} isLast={i === session.messages.length - 1} onRegenerate={onRegenerate} onVersion={onVersion} onToast={onToast} onSelect={onSuggestion} />)}
      </div></div>
      {stuck && (
        <button className="jump-btn" onClick={jumpToBottom} aria-label="Scroll to latest messages">
          <ArrowDown size={17} />
        </button>
      )}
    </div>
  );
}
