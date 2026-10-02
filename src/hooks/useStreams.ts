import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";

// Per-chat stream slots: sessionId -> assistant msgUid. The old single-slot
// model meant a second chat's stream destroyed the first's Stop control.
// Extracted from App.tsx to keep the god component lean.
export function useStreams(activeIdRef: MutableRefObject<string | null>) {
  const [streams, setStreams] = useState<Record<string, string>>({});
  const aborts = useRef(new Map<string, AbortController>());

  const stopChat = useCallback((sid?: string | null) => {
    const id = sid ?? activeIdRef.current;
    if (!id) return;
    aborts.current.get(id)?.abort();
    aborts.current.delete(id);
    setStreams((p) => {
      if (!(id in p)) return p;
      const n = { ...p };
      delete n[id];
      return n;
    });
  }, [activeIdRef]);

  const stopAllChats = useCallback(() => {
    for (const c of aborts.current.values()) { try { c.abort(); } catch { /* already aborted */ } }
    aborts.current.clear();
    setStreams({});
  }, []);

  // Ref mirror for guards inside callbacks (send/regenerate/edit) that must
  // not close over stale state.
  const streamsRef = useRef<Record<string, string>>({});
  useEffect(() => { streamsRef.current = streams; }, [streams]);

  return { streams, setStreams, streamsRef, aborts, stopChat, stopAllChats };
}
