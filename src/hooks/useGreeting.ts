import { useCallback, useMemo } from "react";
import { buildGreeting, greetingStats } from "../lib/greeting";
import type { Session } from "../lib/store";

// Dynamic hero greeting: time of day + recency/frequency + unfinished work.
// Deterministic, never random. Extracted from App.tsx.
export function useGreeting(opts: {
  sessions: Session[];
  profileName?: string | null;
  authName?: string | null;
  sendMessage: (text: string, atts: []) => void;
}) {
  const { sessions, profileName, authName, sendMessage } = opts;
  const heroGreeting = useMemo(() => buildGreeting({
    hour: new Date().getHours(),
    name: (profileName || authName || "there").trim() || "there",
    ...greetingStats(sessions),
    hasUnfinished: sessions.some((s) => {
      const l = s.messages[s.messages.length - 1];
      return !!l && (!!l.interrupted || !!l.error);
    }),
  }), [profileName, authName, sessions]);

  // Stable suggestion sender — keeps memoised messages from re-rendering.
  const sendSuggestion = useCallback((t: string) => {
    sendMessage(t, []);
  }, [sendMessage]);

  return { heroGreeting, sendSuggestion };
}
