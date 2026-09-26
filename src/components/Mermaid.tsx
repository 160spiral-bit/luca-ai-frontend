import { useEffect, useRef, useState } from "react";

// Mermaid loads dynamically on first diagram — never in the eager bundle.
// Theme-aware (was hardcoded dark) and securityLevel strict (was loose,
// which allowed HTML injection through diagram labels).
let initTheme: string | null = null;
async function ensureMermaid() {
  const mermaid = (await import("mermaid")).default;
  const dark = document.documentElement.getAttribute("data-theme") !== "light";
  const want = dark ? "dark" : "default";
  if (initTheme !== want) {
    mermaid.initialize({ startOnLoad: false, theme: want, securityLevel: "strict" });
    initTheme = want;
  }
  return mermaid;
}
export function Mermaid({ code, defer }: { code: string; defer?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const trimmed = code.trim();
  useEffect(() => {
    // While streaming, the diagram source is half-written: every token would
    // trigger a doomed render attempt (console error spam). Show code until done.
    if (defer || !trimmed) { if (!trimmed) setFailed(true); return; }
    let dead = false;
    (async () => {
      try {
        const mermaid = await ensureMermaid();
        // mermaid v10 API: render(id, code) returns { svg }. Unique id per
        // render; empty code guarded above with a <pre> fallback below.
        const id = "mmd-" + Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
        const { svg } = await mermaid.render(id, trimmed);
        if (!dead && ref.current) ref.current.innerHTML = svg;
      } catch (err) {
        console.error("[viz] mermaid render failed:", err, "\ncode:", trimmed.slice(0, 400));
        if (!dead) setFailed(true);
      }
    })();
    return () => { dead = true; };
  }, [trimmed, defer]);
  if (failed || !trimmed || defer) return <pre><code>{code}</code></pre>;
  return <div ref={ref} style={{ minHeight: 40, display: "flex", justifyContent: "center", overflowX: "auto" }} />;
}
