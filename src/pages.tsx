import { Link } from "react-router-dom";
import { ArrowRight, Brain, Image as ImageIcon, Shield, Zap } from "lucide-react";
import Logo from "./components/Logo";

const FEATURES = [
  {
    icon: Zap,
    title: "Flash & Pro",
    text: "Instant answers with Flash; switch to Pro when a problem deserves deeper reasoning.",
  },
  {
    icon: Brain,
    title: "Built to reason",
    text: "Multi-step problems, code review, research synthesis — with the thinking shown, not hidden.",
  },
  {
    icon: ImageIcon,
    title: "Image generation",
    text: "Describe a scene and Luca renders it inline, ready to download or iterate on.",
  },
  {
    icon: Shield,
    title: "Private by design",
    text: "Guest chats never leave your device. Sign in only when you want them synced.",
  },
];

export function About() {
  return (
    <div className="about-page">
      <header className="about-nav">
        <Link to="/" className="about-brand" aria-label="Luca home">
          <Logo size={14} />
          <span>Luca</span>
        </Link>
        <Link to="/chat" className="btn-primary about-nav-cta">Open chat</Link>
      </header>
      <main className="about-main">
        <p className="about-kicker">About Luca AI</p>
        <h1 className="about-title">Think <em>further</em>, not longer.</h1>
        <p className="about-lead">
          Luca is a fast, private AI chat for engineering, reasoning, and research —
          Flash answers up front, Pro reasoning on demand, image generation built in.
        </p>
        <div className="about-actions">
          <Link to="/chat" className="btn-primary about-cta">Open chat <ArrowRight size={14} /></Link>
          <Link to="/" className="btn-ghost about-cta">Home</Link>
        </div>
        <section className="about-feats" aria-label="Features">
          {FEATURES.map((f) => (
            <div key={f.title} className="about-feat">
              <f.icon size={17} aria-hidden="true" />
              <h2>{f.title}</h2>
              <p>{f.text}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="about-foot">
        <span>Luca AI</span>
        <span>Private by design</span>
      </footer>
    </div>
  );
}
