import { useEffect } from "react";

const TARGETS = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON"]);

function isTyping(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node || !node.tagName) return true;
  if (node.isContentEditable) return true;
  return TARGETS.has(node.tagName);
}

export interface HotkeyActions {
  onNewChat: () => void;
  onOpenPalette: () => void;
  onStopStreaming: () => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  isStreaming: boolean;
}

export default function useHotkeys(a: HotkeyActions) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); a.onOpenPalette(); return; }
      if (mod && e.key.toLowerCase() === "n") { e.preventDefault(); a.onNewChat(); return; }
      if (mod && e.shiftKey && e.key.toLowerCase() === "l") { e.preventDefault(); a.onToggleTheme(); return; }
      if (mod && e.key === ",") { e.preventDefault(); a.onOpenSettings(); return; }

      if (e.key === "Escape" && a.isStreaming && !isTyping(e.target)) {
        e.preventDefault();
        a.onStopStreaming();
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [a]);
}

export const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "⌘ K", label: "Command palette" },
  { keys: "⌘ N", label: "New chat" },
  { keys: "⌘ ⇧ L", label: "Toggle theme" },
  { keys: "⌘ ,", label: "Settings" },
  { keys: "Esc", label: "Stop generating" },
];
