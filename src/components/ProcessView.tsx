import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Globe, Code2, FileText, Wrench } from "lucide-react";
import type { LucaMessage, ToolRound } from "../lib/store";

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

function fmtDur(ms?: number): string | null {
  if (!ms || ms <= 0) return null;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${Math.max(1, s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

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

/** Elapsed seconds derived from a timestamp stored ON THE MESSAGE, so it never
 *  resets when the component remounts (virtualisation, chat switch, reload). */
function useElapsed(startedAt: number | undefined, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
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
  const elapsed = useElapsed(msg.startedAt, streaming);

  if (!streaming && !hasTrace && rounds.length === 0) return null;

  // Auto-open while the model is working with nothing to read yet; collapse
  // once the answer is flowing. An explicit user click always wins.
  const auto = streaming && (!msg.content || running.length > 0);
  const open = userOpen ?? auto;

  /* ----- label ---------------------------------------------------- */
  let label: string;
  if (streaming) {
    if (msg.stageLabel) label = msg.stageLabel;
    else if (running.length) label = `Using ${running.map((r) => prettyToolName(r.name)).join(", ")}`;
    else if (!msg.content) label = hasTrace ? "Thinking" : "Working on it";
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
  const lastLine = reasoning.split(/\n+/).filter(Boolean).slice(-1)[0] || "";

  return (
    <div className={`pv${streaming ? " pv--live" : " pv--done"}${open ? " pv--open" : ""}`}>
      <button
        type="button"
        className="pv-head"
        onClick={() => setUserOpen(!open)}
        aria-expanded={open}
        aria-controls={bodyId}
      >
        {/* Finished state is text-only (no leading icon); live keeps the orb. */}
        {streaming && (
          <span className="pv-icon" aria-hidden="true">
            <span className="pv-orb" />
          </span>
        )}
        <span className="pv-label">{label}</span>
        {streaming && elapsed > 0 && <span className="pv-time">{elapsed}s</span>}
        {/* Right chevron when collapsed, down chevron when expanded. The live
            header keeps the single rotating chevron exactly as before. */}
        {streaming || open ? (
          <ChevronDown size={13} className="pv-chev" aria-hidden="true" />
        ) : (
          <ChevronRight size={13} className="pv-chev" aria-hidden="true" />
        )}
      </button>

      {/* One-line peek at the latest thought while collapsed and live. */}
      {streaming && !open && lastLine && <div className="pv-peek" aria-hidden="true">{lastLine}</div>}

      {/* Height animates via grid rows, no JS measuring. */}
      <div className="pv-collapse" id={bodyId} data-open={open}>
        <div className="pv-collapse-inner">
          <div className="pv-body">
            {hasTrace && <div className="pv-trace">{reasoning}</div>}
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
