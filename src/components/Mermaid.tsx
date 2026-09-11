import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({ startOnLoad: false, theme: "dark", flowchart: { htmlLabels: true }, securityLevel: "loose" });

export function Mermaid({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const { svg } = await mermaid.render("mmd-" + Math.random().toString(36).slice(2), code);
        if (!dead && ref.current) ref.current.innerHTML = svg;
      } catch (err) {
        console.error("[viz] mermaid render failed:", err, "\ncode:", code.slice(0, 400));
        if (!dead) setFailed(true);
      }
    })();
    return () => { dead = true; };
  }, [code]);
  if (failed) return <pre><code>{code}</code></pre>;
  return <div ref={ref} style={{ minHeight: 40, display: "flex", justifyContent: "center", overflowX: "auto" }} />;
}
