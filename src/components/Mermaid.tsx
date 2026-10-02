import { useEffect, useId, useRef, useState } from "react";
import DOMPurify from "dompurify";

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
  // Stable render-id prefix (no Math.random/Date.now per render).
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const renderCount = useRef(0);
  const trimmed = code.trim();
  useEffect(() => {
    // Reset a previous failure so a corrected code change retries rendering
    // instead of sticking on the <pre> fallback forever.
    setFailed(false);
    // While streaming, the diagram source is half-written: every token would
    // trigger a doomed render attempt (console error spam). Show code until done.
    if (defer || !trimmed) { if (!trimmed) setFailed(true); return; }
    let dead = false;
    (async () => {
      try {
        const mermaid = await ensureMermaid();
        // mermaid v10 API: render(id, code) returns { svg }. Unique id per
        // render via stable useId prefix + monotonic counter; empty code
        // guarded above with a <pre> fallback below.
        renderCount.current += 1;
        const id = `mmd-${uid}-${renderCount.current}`;
        const { svg } = await mermaid.render(id, trimmed);
        // securityLevel: strict relies on Mermaid's bundled DOMPurify config —
        // a third-party version bump away from a hole. Sanitize the SVG here
        // too, so model-controlled diagram source is verified, not trusted.
        if (!dead && ref.current) ref.current.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true } });
      } catch (err) {
        // Half-written source while streaming fails every render — dev only.
        if (import.meta.env.DEV) console.error("[viz] mermaid render failed:", err, "\ncode:", trimmed.slice(0, 400));
        if (!dead) setFailed(true);
      }
    })();
    return () => { dead = true; };
  }, [trimmed, defer, uid]);
  if (failed || !trimmed || defer) return <pre><code>{code}</code></pre>;
  return <div ref={ref} className="mermaid-wrap" role="img" aria-label={`Diagram: ${trimmed.slice(0, 100)}`} />;
}
