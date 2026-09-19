import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({ startOnLoad: false, theme: "dark", flowchart: { htmlLabels: true }, securityLevel: "loose" });

export function Mermaid({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const trimmed = code.trim();
  useEffect(() => {
    if (!trimmed) { setFailed(true); return; }
    let dead = false;
    (async () => {
      try {
        // mermaid v11 API: render(id, code) returns {svg}. Guard empty/invalid.
        const id = "mmd-" + Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
        const { svg } = await mermaid.render(id, trimmed);
        if (!dead && ref.current) ref.current.innerHTML = svg;
      } catch (err) {
        console.error("[viz] mermaid render failed:", err, "\ncode:", trimmed.slice(0, 400));
        if (!dead) setFailed(true);
      }
    })();
    return () => { dead = true; };
  }, [trimmed]);
  if (failed || !trimmed) return <pre><code>{code}</code></pre>;
  return <div ref={ref} style={{ minHeight: 40, display: "flex", justifyContent: "center", overflowX: "auto" }} />;
}
