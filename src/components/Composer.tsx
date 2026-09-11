import { useEffect, useRef, useState } from "react";
import { Brain, FileText, Mic, Plus, Square, X } from "lucide-react";
import { downscaleImage, uid } from "../lib/store";
import type { Attachment, Settings, Tier } from "../lib/store";

const MAX_FILE = 4 * 1024 * 1024;
const MAX_LEN = 200000;

interface Props {
  streaming: boolean; onSend: (text: string, atts: Attachment[]) => void; onStop: () => void;
  tier: Tier; onTierChange: (t: Tier) => void; settings: Settings; onToast: (m: string) => void;
}

export default function Composer({ streaming, onSend, onStop, tier, onTierChange, settings, onToast }: Props) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [listening, setListening] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recogRef = useRef<{ stop: () => void } | null>(null);

  // FIX 1a: auto-resize as the user types up to MAX_H (200px); only past
  // that does the textarea get its own internal scroll (overflow flips).
  // Resetting to "auto" first lets it shrink again when text is deleted.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
    ta.style.overflowY = ta.scrollHeight > 200 ? "auto" : "hidden";
  }, [text]);

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !streaming;
  const doSend = () => {
    if (!canSend) return;
    if (text.length > MAX_LEN) { onToast("Message is over the character limit"); return; }
    onSend(text.trim(), attachments);
    setText(""); setAttachments([]);
    requestAnimationFrame(() => taRef.current?.focus());
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
      const r = new FileReader();
      r.onload = () => setAttachments((p) => [...p, { id: uid(), name: f.name, type: f.type, size: f.size, dataUrl: String(r.result) }]);
      r.readAsDataURL(f);
    }
  };
  const addFilesRef = useRef(addFiles);
  useEffect(() => { addFilesRef.current = addFiles; });

  useEffect(() => {
    let n = 0;
    const onPaste = (e: ClipboardEvent) => {
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
    r.lang = "en-US"; r.continuous = false; r.interimResults = false;
    r.onresult = (e) => { const t = e.results[0]?.[0]?.transcript || ""; if (t) setText((p) => (p ? p + " " : "") + t); };
    r.onend = () => setListening(false);
    r.onerror = () => { setListening(false); onToast("Couldn't hear anything — try again"); };
    r.start(); recogRef.current = r; setListening(true);
  };

  const isPro = tier === "pro";
  const coarse = (() => { try { return window.matchMedia && window.matchMedia("(pointer: coarse)").matches; } catch { return false; } })();

  return (
    <div className="composer-zone"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}>
      <div className="composer-wrap">
        {attachments.length > 0 && (
          <div className="attach-row">
            {attachments.map((a) => (
              <span key={a.id} className="attach-chip">
                {a.type.startsWith("image/") ? <img src={a.dataUrl} alt="" /> : <FileText size={13} />}
                <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                <button onClick={() => setAttachments((p) => p.filter((x) => x.id !== a.id))} aria-label={`Remove ${a.name}`}><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="composer" style={dragOver ? { borderColor: "var(--line-strong)" } : undefined}>
          <input ref={fileRef} type="file" multiple hidden
            onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }} />
          <button className="circle-btn" onClick={() => fileRef.current?.click()} aria-label="Attach files" title="Add files — or just paste a screenshot"><Plus size={19} /></button>
          <textarea ref={taRef} rows={1} value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (!coarse && settings.enterToSend && !e.shiftKey) { e.preventDefault(); doSend(); }
              else if (!coarse && !settings.enterToSend && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doSend(); }
            }}
            placeholder="Ask Luca anything" aria-label="Message Luca" />
          <button className={`pro-btn ${isPro ? "on" : ""}`} onClick={() => onTierChange(isPro ? "flash" : "pro")} aria-pressed={isPro} title="Toggle Pro reasoning">
            <Brain size={14} />Pro
          </button>
          <button className="circle-btn" onClick={toggleMic} aria-pressed={listening} aria-label="Voice input" style={listening ? { color: "var(--danger)" } : undefined}>
            <Mic size={17} />
          </button>
          {streaming ? (
            <button className="circle-btn send-btn" onClick={onStop} aria-label="Stop generating"><Square size={14} fill="currentColor" strokeWidth={0} /></button>
          ) : (
            <button className="circle-btn send-btn" onClick={doSend} disabled={!canSend} aria-label="Send message">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="fineprint">I can get things wrong — double-check the important stuff.</div>
      </div>
    </div>
  );
}
