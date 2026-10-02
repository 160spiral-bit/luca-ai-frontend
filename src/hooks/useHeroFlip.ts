import { useCallback, useEffect, useRef } from "react";
import type { Attachment } from "../lib/store";

// Centered hero input -> docked composer FLIP on first message.
// Extracted from App.tsx to keep it under budget.
export function useHeroFlip(
  isEmpty: boolean,
  sendMessage: (text: string, atts: Attachment[]) => void,
) {
  const heroRect = useRef<DOMRect | null>(null);
  const sendFromHero = useCallback((text: string, atts: Attachment[]) => {
    const el = document.querySelector(".home .composer-zone");
    heroRect.current = el ? el.getBoundingClientRect() : null;
    sendMessage(text, atts);
  }, [sendMessage]);
  useEffect(() => {
    if (isEmpty || !heroRect.current) return;
    const el = document.querySelector(".main > .composer-zone");
    const from = heroRect.current;
    heroRect.current = null;
    if (!el) return;
    const to = el.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)`, opacity: 0.4 }, { transform: "none", opacity: 1 }],
      { duration: 320, easing: "cubic-bezier(.22,.8,.24,1)" }
    );
  }, [isEmpty]);
  return { sendFromHero };
}
