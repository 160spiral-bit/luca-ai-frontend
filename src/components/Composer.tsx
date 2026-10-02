import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, FileText, Mic, Paperclip, Square, X } from "lucide-react";
import { downscaleImage, uid } from "../lib/store";
import type { Attachment, Settings, Tier } from "../lib/store";

const MAX_FILE = 4 * 1024 * 1024;
const MAX_LEN = 200000;

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

const TIER_LABEL: Record<Tier, string> = { flash: "Flash", pro: "Pro" };

interface Props {
  streaming: boolean; onSend: (text: string, atts: Attachment[]) => void; onStop: () => void;
  tier: Tier; onTierChange: (t: Tier) => void; settings: Settings; onToast: (m: string) => void;
  prefill?: string | null; onPrefillConsumed?: () => void;
}

export default function Composer({ streaming, onSend, onStop, tier, onTierChange, settings, onToast, prefill, onPrefillConsumed }: Props) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [modelOpen, setModelOpen] = useState(false);
  const modelOptionsId = useId();

  // Allow parent to push last user message back into the input for "Edit message"
  useEffect(() => {
    if (prefill != null && prefill !== "") {
      setText(prefill);
      requestAnimationFrame(() => taRef.current?.focus());
      onPrefillConsumed?.();
    }
  }, [prefill, onPrefillConsumed]);
  const [dragOver, setDragOver] = useState(false);
  const [listening, setListening] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const modelRef = useRef<HTMLDivElement | null>(null);
  const recogRef = useRef<{ stop: () => void } | null>(null);
  const collapseTimer = useRef<number | undefined>(undefined);

  // Auto-grow up to 200px, then internal scroll. Reset to auto first so it
  // shrinks again when text is deleted.
  // Runtime exception (intentional imperative styles): textarea height depends
  // on live scrollHeight measurement each keystroke, which static CSS cannot
  // express. `.write textarea` also declares `field-sizing: content` so
  // supporting browsers auto-grow natively and this effect is a fallback.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
    ta.style.overflowY = ta.scrollHeight > 200 ? "auto" : "hidden";
  }, [text]);

  // Model control: click-outside and Escape close it.
  useEffect(() => {
    if (!modelOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setModelOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setModelOpen(false); taRef.current?.focus(); } };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(collapseTimer.current);
    };
  }, [modelOpen]);

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !streaming;
  const doSend = () => {
    if (!canSend) return;
    if (text.length > MAX_LEN) { onToast("Message is over the character limit"); return; }
    onSend(text.trim(), attachments);
    setText(""); setAttachments([]);
    requestAnimationFrame(() => taRef.current?.focus());
  };

  const pickModel = (t: Tier, opts?: { keepOpen?: boolean }) => {
    onTierChange(t);
    window.clearTimeout(collapseTimer.current);
    if (opts?.keepOpen) return;
    // Selected segment stays visible ~140ms, then the chip collapses back.
    // Keyboard arrow-nav passes keepOpen so this timeout never races the
    // requestAnimationFrame focus below (collapse would hide the radio
    // mid-focus and yank focus to the textarea).
    collapseTimer.current = window.setTimeout(() => { setModelOpen(false); taRef.current?.focus(); }, 140);
  };

  const addFiles = (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE) { onToast(`"${f.name}" is over 4 MB — skipped`); continue; }
      if (f.type.startsWith("image/")) {
        const r = new FileReader();
        r.onload = async () => {
          try {
            const scaled = await downscaleImage(String(r.result), 1024);
            setAttachments((p) => [...p, { id: uid(), name: f.name, type: "image/jpeg", size: Math.round((scaled.length * 3) / 4), dataUrl: scaled }]);
          } catch { onToast(`Couldn't process "${f.name}"`); }
        };
        r.readAsDataURL(f);
        continue;
      }
      // Documents/code: read as TEXT so the model can actually see the contents.
      // (Binary files get attached by name only — flagged honestly downstream.)
      const r = new FileReader();
      r.onload = () => {
        const raw = String(r.result || "");
        // Intentional binary sniffing (NUL + C0 control chars).
        const ctrl = (raw.match(/[\x00-\x08\x0E-\x1F\x7F]/g) || []).length; // eslint-disable-line no-control-regex
        const isBinary = raw.includes("\0") || (raw.length > 500 && ctrl / Math.max(1, raw.length) > 0.1);
        if (isBinary) {
          setAttachments((p) => [...p, { id: uid(), name: f.name, type: f.type || "application/octet-stream", size: f.size, dataUrl: "" }]);
          return;
        }
        const MAX_DOC = 50000;
        const doctext = raw.length > MAX_DOC ? raw.slice(0, MAX_DOC) + `\n\n[... truncated — file was ${raw.length} characters ...]` : raw;
        setAttachments((p) => [...p, { id: uid(), name: f.name, type: f.type || "text/plain", size: f.size, dataUrl: "", text: doctext }]);
      };
      r.readAsText(f);
    }
  };
  const addFilesRef = useRef(addFiles);
  useEffect(() => { addFilesRef.current = addFiles; });

  useEffect(() => {
    let n = 0;
    const onPaste = (e: ClipboardEvent) => {
      // Only hijack pastes aimed at the composer itself — a file pasted into
      // search/rename inputs must behave normally there.
      const t = e.target as HTMLElement | null;
      if (!t || (t.tagName !== "TEXTAREA" && !(t instanceof HTMLInputElement))) return;
      if (taRef.current && t !== taRef.current) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const it of Array.from(items)) if (it.kind === "file") { const f = it.getAsFile(); if (f) files.push(f); }
      if (!files.length) return;
      e.preventDefault();
      addFilesRef.current(files.map((f, i) => {
        if (f.type.startsWith("image/") && (!f.name || /^image[-. ]?/i.test(f.name))) {
          n += 1;
          const ext = (f.type.split("/")[1] || "png").replace("jpeg", "jpg");
          return new File([f], `pasted-image-${n}${files.length > 1 ? `-${i + 1}` : ""}.${ext}`, { type: f.type });
        }
        return f;
      }));
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const toggleMic = () => {
    const SR = (window as unknown as { webkitSpeechRecognition?: new () => {
      lang: string; continuous: boolean; interimResults: boolean;
      onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
      onend: (() => void) | null; onerror: (() => void) | null;
      start: () => void; stop: () => void;
    } }).webkitSpeechRecognition;
    if (!SR) { onToast("Voice input isn't supported in this browser"); return; }
    if (listening) { recogRef.current?.stop(); setListening(false); return; }
    const r = new SR();
    r.lang = (navigator.language || "en-US").split(",")[0] || "en-US"; r.continuous = false; r.interimResults = false;
    r.onresult = (e) => { const t = e.results[0]?.[0]?.transcript || ""; if (t) setText((p) => (p ? p + " " : "") + t); };
    r.onend = () => setListening(false);
    r.onerror = () => { setListening(false); onToast("Couldn't hear anything — try again"); };
    r.start(); recogRef.current = r; setListening(true);
  };

  const coarse = (() => { try { return window.matchMedia && window.matchMedia("(pointer: coarse)").matches; } catch { return false; } })();

  return (
    <div className="composer-zone"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}>
      <div className={`composer${dragOver ? " drag-over" : ""}`}>
        <div className="pending-files">
          {attachments.map((a) => (
            <span key={a.id} className="pf">
              {a.type.startsWith("image/") && a.dataUrl
                ? <img src={a.dataUrl} alt="" />
                : <FileText size={11} />}
              <span className="pf-name">{a.name} · {fmtSize(a.size)}</span>
              <button onClick={() => setAttachments((p) => p.filter((x) => x.id !== a.id))} aria-label={`Remove ${a.name}`}><X size={10} /></button>
            </span>
          ))}
        </div>
        <input ref={fileRef} type="file" multiple hidden accept="image/*,.pdf,.txt,.md,.markdown,.csv,.json,.js,.jsx,.ts,.tsx,.py,.html,.css,.yaml,.yml,.sql,.sh,.xml,.log"
          onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }} />
        <div className="write">
          <textarea ref={taRef} rows={1} value={text} onChange={(e) => setText(e.target.value)} spellCheck={true}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (!coarse && settings.enterToSend && !e.shiftKey) { e.preventDefault(); doSend(); }
              else if (!coarse && !settings.enterToSend && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doSend(); }
            }}
            placeholder="Ask Luca anything" aria-label="Message Luca" />
        </div>
        <div className="tools">
          <div className="left">
            <button type="button" className="tool" onClick={() => fileRef.current?.click()} aria-label="Attach files" title="Attach files"><Paperclip size={15} /></button>
            <button type="button" className={`tool${listening ? " listening" : ""}`} onClick={toggleMic} aria-pressed={listening} aria-label="Voice input" title="Voice input"><Mic size={15} /></button>
            {/* Chevron lives OUTSIDE the radiogroup: a radiogroup must contain
                only radio roles — the toggle is a separate control. */}
            <div ref={modelRef} className={`model-ctl${modelOpen ? " open" : ""}`}>
              <div role="radiogroup" aria-label="Model" className="model-options" id={modelOptionsId}>
              {(["flash", "pro"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={tier === t}
                  data-tier={t}
                  className={`seg${tier === t ? " selected" : ""}`}
                  tabIndex={modelOpen ? 0 : (tier === t ? 0 : -1)}
                  onClick={() => pickModel(t)}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                    e.preventDefault();
                    const order: Tier[] = ["flash", "pro"];
                    const idx = order.indexOf(t);
                    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
                    const next = order[(idx + dir + order.length) % order.length] as Tier;
                    // keepOpen: stay expanded so the rAF focus below lands on
                    // a visible radio instead of racing the 140ms collapse.
                    pickModel(next, { keepOpen: true });
                    requestAnimationFrame(() => {
                      modelRef.current?.querySelector<HTMLElement>(`[data-tier="${next}"]`)?.focus();
                    });
                  }}>
                  {TIER_LABEL[t]}
                </button>
              ))}
              </div>
              <button
                type="button"
                className="chev"
                aria-expanded={modelOpen}
                aria-controls={modelOptionsId}
                aria-label={modelOpen ? "Collapse model options" : `Change model, current: ${TIER_LABEL[tier]}`}
                onClick={() => setModelOpen((v) => !v)}
              >
                <ChevronDown size={11} />
              </button>
            </div>
          </div>
          <div className="right">
            {streaming ? (
              <button className="send" onClick={onStop} aria-label="Stop generating" title="Stop">
                <Square size={13} fill="currentColor" strokeWidth={0} />
              </button>
            ) : (
              <button className="send" onClick={doSend} disabled={!canSend} aria-label="Send message" title="Send">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M12 19V5m0 0-6 6m6-6 6 6" /></svg>
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="disclaimer">Luca can make mistakes. Double-check the important stuff.</p>
    </div>
  );
}
