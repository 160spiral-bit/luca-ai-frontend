import { Link } from "react-router-dom";

export function About() {
  return (
    <div className="center-page about-page">
      <div className="about-inner">
        <Link to="/" className="btn-ghost about-back">← Back to Luca</Link>
        <h1 className="about-title">About Luca AI</h1>
        <p className="about-text">
          Luca is a fast, private AI chat with a Pro reasoning toggle and image generation.
          Flash answers up front, deeper thinking on demand.
        </p>
        <div className="about-actions">
          <Link to="/chat" className="btn-primary about-cta">Open chat</Link>
          <Link to="/" className="btn-ghost about-cta">Home</Link>
        </div>
      </div>
    </div>
  );
}
