import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Globe, Code2, FileText, Wrench } from "lucide-react";
import type { LucaMessage, ToolRound } from "../lib/store";
import { fmtDur } from "../lib/format";

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

function prettyToolName(name: string): string {
  if (name === "web_search" || name === "search") return "Web search";
  if (name === "run_code") return "Run code";
  if (name === "fetch_page") return "Read page";
  const p = name.split("__");
  if (p[0] === "mcp" && p.length >= 3) return `${p[1]}/${p.slice(2).join("__")}`;
  return name || "Tool";
}

function ToolIcon({ name }: { name: string }) {
  const p = { size: 11, strokeWidth: 1.75, "aria-hidden": true } as const;
  if (name === "web_search" || name === "search") return <Globe {...p} />;
  if (name === "run_code") return <Code2 {...p} />;
  if (name === "fetch_page") return <FileText {...p} />;
  return <Wrench {...p} />;
}

/* Finished-state summary: group rounds by tool type so the collapsed pill
   reads like "Ran 4 commands, read 2 files" instead of "Used 6 tools". */
function summarizeTools(rounds: ToolRound[]): string | null {
  if (!rounds.length) return null;
  const count = (match: (name: string) => boolean) =>
    rounds.filter((r) => match(r.name || "")).length;
  const commands = count((n) => n === "run_code");
  const reads = count((n) => n === "fetch_page");
  const searches = count((n) => n === "web_search" || n === "search");
  const other = rounds.length - commands - reads - searches;
  const parts: string[] = [];
  if (commands) parts.push(`ran ${commands} command${commands === 1 ? "" : "s"}`);
  if (reads) parts.push(`read ${reads} file${reads === 1 ? "" : "s"}`);
  if (searches) parts.push(`searched ${searches} time${searches === 1 ? "" : "s"}`);
  if (other) parts.push(`used ${other} other tool${other === 1 ? "" : "s"}`);
  if (!parts.length) return null;
  const joined = parts.join(", ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/* ------------------------------------------------------------------ */
/* component                                                          */
/* ------------------------------------------------------------------ */

export default function ProcessView({ msg }: { msg: LucaMessage }) {
  // null = follow automatic behaviour, true/false = the user's explicit choice.
  const [userOpen, setUserOpen] = useState<boolean | null>(null);

  const streaming = !!msg.streaming;
  const rounds: ToolRound[] = msg.toolRounds || [];
  const reasoning = (msg.reasoning || "").trim();
  const hasTrace = reasoning.length > 0;
  const running = rounds.filter((r) => r.status === "running" && streaming);

  // Follow the trace while it streams: the box is capped at 220px, so without
  // this the user stares at the first lines while the new ones pile up unseen
  // below. Only follows while streaming; a finished trace stays put.
  const traceRef = useRef<HTMLDivElement | null>(null);
  const tracedLen = useRef(0);
  useEffect(() => {
    if (!streaming || reasoning.length === tracedLen.current) return;
    tracedLen.current = reasoning.length;
    const el = traceRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [streaming, reasoning]);

  if (!streaming && !hasTrace && rounds.length === 0) return null;

  // Auto-open while the model is working with nothing to read yet; collapse
  // once the answer is flowing. An explicit user click always wins.
  const auto = streaming && (!msg.content || running.length > 0);
  const open = userOpen ?? auto;

  /* ----- label ---------------------------------------------------- */
  let label: string;
  if (streaming) {
    if (running.length) label = `Using ${running.map((r) => prettyToolName(r.name)).join(", ")}`;
    // Live thinking stays present-tense with no seconds: the "Thought for Xs"
    // wording is reserved for the finished pill. A live stage label is
    // deliberately ignored here: it churns and reads as noise.
    else if (!msg.content) label = "Thinking…";
    else label = "Writing";
  } else {
    const bits: string[] = [];
    // Reasoning time only (first reasoning event -> first content), tool time
    // is reported separately so nothing is double counted.
    if (hasTrace && msg.thinkingMs) bits.push(`Thought for ${fmtDur(msg.thinkingMs)}`);
    else if (hasTrace) bits.push("Thought");
    if (rounds.length) {
      bits.push(summarizeTools(rounds) ?? `Used ${rounds.length} tool${rounds.length === 1 ? "" : "s"}`);
    }
    label = bits.join("  ·  ") || "Details";
  }

  const bodyId = `pv-${msg.uid}`;

  return (
    <div className={`pv${streaming ? " pv--live" : " pv--done"}${open ? " pv--open" : ""}`}>
      <button
        type="button"
        className="pv-head"
        onClick={() => setUserOpen(!open)}
        aria-expanded={open}
        aria-controls={bodyId}
      >
        <span className="pv-label">{label}</span>
        {/* Right chevron when collapsed, down chevron when expanded - the same
            swap the finished pill uses, for both live and done. */}
        {open ? (
          <ChevronDown size={13} className="pv-chev" aria-hidden="true" />
        ) : (
          <ChevronRight size={13} className="pv-chev" aria-hidden="true" />
        )}
      </button>

      {/* Height animates via grid rows, no JS measuring. Collapsed content is
          removed from the a11y tree and tab order: grid 0fr hides it visually
          but screen readers and find-in-page still see everything.
          inert is set via ref (not a boolean prop) so React 18 never warns
          "Received `true` for non-boolean attribute". */}
      <div className="pv-collapse" id={bodyId} data-open={open} aria-hidden={!open || undefined} ref={(el) => { if (el) { try { (el as HTMLElement & { inert: boolean }).inert = !open; } catch { /* inert unsupported — aria-hidden still hides it */ } } }}>
        <div className="pv-collapse-inner">
          <div className="pv-body">
            {hasTrace && <div className="pv-trace" ref={traceRef}>{reasoning}</div>}
            {rounds.length > 0 && (
              <ul className="pv-tools">
                {rounds.map((r) => {
                  const isRunning = r.status === "running" && streaming;
                  return (
                    <li key={r.id} className={`pv-tool${isRunning ? " pv-tool--run" : ""}`}>
                      <span className="pv-tool-ico">
                        {isRunning ? <span className="pv-orb pv-orb--sm" /> : <ToolIcon name={r.name} />}
                      </span>
                      <div className="pv-tool-main">
                        <div className="pv-tool-top">
                          <strong>{prettyToolName(r.name)}</strong>
                          {!!r.ms && <span className="pv-tool-ms">{(r.ms / 1000).toFixed(1)}s</span>}
                        </div>
                        {r.query && <div className="pv-tool-q">{r.query}</div>}
                        {r.result && <div className="pv-tool-r">{r.result}</div>}
                        {!!r.sources?.length && (
                          <div className="pv-tool-src">
                            {r.sources.length} source{r.sources.length === 1 ? "" : "s"}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
