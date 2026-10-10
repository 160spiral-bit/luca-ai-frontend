import { Link } from "react-router-dom";
import { MessageSquare, Sparkles, Image as ImageIcon, Search, Zap, ShieldCheck } from "lucide-react";

const FEATURES = [
  { icon: <Zap size={19} />, title: "Flash answers", body: "Instant replies with a fast model. No waiting, no thinking-out-loud." },
  { icon: <Sparkles size={19} />, title: "Pro reasoning", body: "A deeper tier that thinks through hard problems step by step before answering." },
  { icon: <ImageIcon size={19} />, title: "Image generation", body: "Ask for a picture and get one. Editable in conversation — just say what to change." },
  { icon: <Search size={19} />, title: "Live web search", body: "Current facts, prices, and news are grounded with real sources you can check." },
  { icon: <MessageSquare size={19} />, title: "Markdown, charts & code", body: "Tables, Mermaid diagrams, KaTeX math and syntax-highlighted code, all native." },
  { icon: <ShieldCheck size={19} />, title: "Private by default", body: "Your chats live on your device. Sign in only when you want them synced." },
];

function Demo() {
  return (
    <div className="lp-demo" aria-hidden="true">
      <div className="lp-demo-bar">
        <span className="lp-dot" /><span className="lp-dot" /><span className="lp-dot" />
      </div>
      <div className="lp-demo-body">
        <div className="lp-turn lp-turn-user">
          <div className="lp-bubble">Explain why the sky is blue like I'm five</div>
        </div>
        <div className="lp-turn lp-turn-luca">
          <div className="lp-ava">L</div>
          <div className="lp-bubble">Sunlight looks white, but it's really all the colours mixed together. When it travels through the air, tiny molecules scatter the blue part far more than the rest — so blue ends up bouncing all across the sky.</div>
        </div>
        <div className="lp-turn lp-turn-user">
          <div className="lp-bubble">Now show me a diagram</div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="landing">
      <nav className="lp-nav">
        <span className="lp-brand">Luca</span>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/about" className="btn-ghost">About</Link>
          <Link to="/chat" className="btn-primary">Open chat</Link>
        </div>
      </nav>

      <section className="lp-hero">
        <span className="lp-eyebrow">Flash · Pro · Vision</span>
        <h1 className="lp-title">Think it. <em>Ask it.</em></h1>
        <p className="lp-sub">
          A fast AI chat that grounds itself in live sources, draws diagrams, writes code and
          generates images — without making you switch tools.
        </p>
        <div className="lp-cta">
          <Link to="/chat" className="btn-primary">Start chatting</Link>
          <Link to="/about" className="btn-ghost">How it works</Link>
        </div>
        <Demo />
      </section>

      <section className="lp-features">
        <div className="lp-grid">
          {FEATURES.map((f) => (
            <div className="lp-card" key={f.title}>
              <div className="lp-card-ico">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="lp-foot">
        <span>Luca AI</span>
        <span style={{ display: "flex", gap: 18 }}>
          <Link to="/chat">Chat</Link>
          <Link to="/about">About</Link>
        </span>
      </footer>
    </div>
  );
}
