import { Menu } from "lucide-react";
import ChatArea from "./ChatArea";
import Composer from "./Composer";
import type { Attachment, Session, Settings, Tier } from "../lib/store";

// Main column (topbar + hero/conv) extracted from App.tsx.
export default function AppMain(p: {
  isEmpty: boolean;
  greetingHead: string;
  greetingSub: string;
  title: string;
  streamingActive: boolean;
  sendFromHero: (text: string, atts: Attachment[]) => void;
  sendMessage: (text: string, atts: Attachment[]) => void;
  onStop: () => void;
  tier: Tier;
  activeTier: Tier;
  onTierChange: (t: Tier) => void;
  onChatTierChange: (t: Tier) => void;
  settings: Settings;
  onToast: (m: string) => void;
  composerDraft: string | null;
  onPrefillConsumed: () => void;
  session: Session | null;
  onSuggestion: (t: string) => void;
  onRegenerate: (sid: string, uid: string) => void;
  onEditResend: (sid: string, uid: string, text: string) => void;
  onVersion: (sid: string, uid: string, i: number) => void;
  onEditDraft: (text: string) => void;
  onOpenArtifact: (id: string) => void;
  onPreviewHtml: (title: string, html: string) => void;
  onOpenMobile: () => void;
}) {
  return (
    <div className="main" id="main">
      {!p.isEmpty && (
      <header className="topbar">
        <button className="icon-btn only-mobile" onClick={p.onOpenMobile} aria-label="Open sidebar"><Menu size={17} /></button>
        <h1>{p.title}</h1>
      </header>
      )}
      {p.isEmpty ? (
        <div className="home">
          <div className="hero">
            <button className="icon-btn only-mobile hero-menu-btn" onClick={p.onOpenMobile} aria-label="Open sidebar"><Menu size={17} /></button>
            <h1 className="hero-greeting">{p.greetingHead} — <em>{p.greetingSub}</em></h1>
            <Composer streaming={p.streamingActive} onSend={p.sendFromHero} onStop={p.onStop}
              tier={p.tier} onTierChange={p.onTierChange} settings={p.settings} onToast={p.onToast} prefill={p.composerDraft} onPrefillConsumed={p.onPrefillConsumed} />
          </div>
        </div>
      ) : (
        <div className="conv">
          <ChatArea session={p.session} settings={p.settings}
            onSuggestion={p.onSuggestion} onRegenerate={p.onRegenerate}
            onEditResend={p.onEditResend} onVersion={p.onVersion} onToast={p.onToast} onEditDraft={p.onEditDraft} onOpenArtifact={p.onOpenArtifact} onPreviewHtml={p.onPreviewHtml} />
          <Composer streaming={p.streamingActive} onSend={p.sendMessage} onStop={p.onStop}
            tier={p.activeTier}
            onTierChange={p.onChatTierChange}
            settings={p.settings} onToast={p.onToast} prefill={p.composerDraft} onPrefillConsumed={p.onPrefillConsumed} />
        </div>
      )}
    </div>
  );
}
