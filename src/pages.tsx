import { useEffect, useState } from "react";
import Logo from "./components/Logo";
import { base } from "./lib/api";

export function Landing({ onEnter }: { onEnter: () => void }) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    fetch(base() + "/api/models").then((r) => (r.ok ? r.json() : null)).then((j) => {
      const c: Record<string, number> = {};
      for (const m of j?.models || []) c[m.tier] = (c[m.tier] || 0) + 1;
      setCounts(c);
    }).catch(() => {});
  }, []);
  return (
    <div className="center-page">
      <div className="landing-hero">
        <div className="brand-mark"><Logo size={26} /></div>
        <h1>Chat with the fastest models alive.</h1>
        <p>Quick answers, deep thinking when you need it — you just talk.</p>
        <button className="btn-primary" style={{ width: "auto", padding: "13px 38px", fontSize: 15 }} onClick={onEnter}>Start chatting</button>
        <div className="status-dots">
          <span><i className={counts && counts.flash ? "" : "down"} />Flash · {counts ? counts.flash ?? 0 : "…"} models</span>
          <span><i className={counts && counts.pro ? "" : "down"} />Pro · {counts ? counts.pro ?? 0 : "…"} models</span>
        </div>
      </div>
    </div>
  );
}

export function About() {
  return (
    <div className="center-page" style={{ justifyContent: "flex-start", paddingTop: "10vh" }}>
      <div style={{ maxWidth: 620, width: "100%" }}>
        <a href="./index.html" className="sugg">← Back to Luca</a>
        <h1 style={{ fontSize: 36, letterSpacing: "-0.02em", margin: "26px 0 12px" }}>About Luca AI</h1>
        <p style={{ color: "var(--ink-2)", lineHeight: 1.75 }}>
          Luca is a fast, private AI chat with a Pro reasoning toggle and image generation.
          Quick answers up front, deeper thinking on demand.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <a href="./chat.html" className="btn-primary" style={{ width: "auto", padding: "11px 26px", textDecoration: "none" }}>Open chat</a>
          <a href="./index.html" className="btn-ghost" style={{ width: "auto", padding: "11px 26px", textDecoration: "none" }}>Home</a>
        </div>
      </div>
    </div>
  );
}
