import { useEffect, useRef } from "react";

// Brand spark: main flare + small satellite spark. With `twinkle`, the two
// flare on independent random schedules (JS-driven, no fixed period) instead
// of a synced CSS loop. Static otherwise.
export default function Logo({ size = 18, twinkle = false }: { size?: number; twinkle?: boolean }) {
  const mainRef = useRef<SVGPathElement | null>(null);
  const smallRef = useRef<SVGPathElement | null>(null);

  useEffect(() => {
    if (!twinkle) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let dead = false;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(() => { if (!dead) fn(); }, ms)); };
    const flareMain = () => {
      const el = mainRef.current;
      if (el) {
        const scale = 1.1 + Math.random() * 0.15;
        const rot = (Math.random() - 0.5) * 20;
        const dur = 400 + Math.random() * 400;
        el.style.transitionDuration = dur + "ms";
        el.style.transform = `scale(${scale}) rotate(${rot}deg)`;
        el.style.opacity = "1";
        later(() => {
          if (!mainRef.current) return;
          mainRef.current.style.transitionDuration = dur * 1.3 + "ms";
          mainRef.current.style.transform = "scale(1) rotate(0deg)";
          mainRef.current.style.opacity = "0.85";
        }, dur);
        later(flareMain, dur * 2.3 + Math.random() * 1800);
      } else {
        later(flareMain, 600);
      }
    };
    const flareSmall = () => {
      const el = smallRef.current;
      if (el) {
        const scale = 0.9 + Math.random() * 0.5;
        const dur = 250 + Math.random() * 350;
        el.style.transitionDuration = dur + "ms";
        el.style.transform = `scale(${scale})`;
        el.style.opacity = String(0.3 + Math.random() * 0.7);
      }
      later(flareSmall, 250 + Math.random() * 350 + Math.random() * 1500 + 300);
    };
    flareMain();
    flareSmall();
    return () => { dead = true; timers.forEach((t) => window.clearTimeout(t)); };
  }, [twinkle]);

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ overflow: "visible" }} aria-hidden="true">
      <path
        ref={mainRef}
        fill="currentColor"
        style={{ transformOrigin: "center", transformBox: "fill-box", transition: "transform 0.5s ease, opacity 0.5s ease", opacity: 0.85 }}
        d="M12 3c.3 2.8 1 4.7 2.1 5.9C15.3 10 17.2 10.7 20 11c-2.8.3-4.7 1-5.9 2.1C12.9 14.3 12.2 16.2 12 19c-.3-2.8-1-4.7-2.1-5.9C8.7 12 6.8 11.3 4 11c2.8-.3 4.7-1 5.9-2.1C11 7.7 11.7 5.8 12 3z"
      />
      <path
        ref={smallRef}
        fill="currentColor"
        opacity="0.5"
        style={{ transformOrigin: "center", transformBox: "fill-box", transition: "transform 0.5s ease, opacity 0.5s ease" }}
        d="M19 2c.15 1.3.5 2.2 1 2.7.5.5 1.4.85 2.7 1-1.3.15-2.2.5-2.7 1-.5.5-.85 1.4-1 2.7-.15-1.3-.5-2.2-1-2.7C17.5 6.2 16.6 5.85 15.3 5.7c1.3-.15 2.2-.5 2.7-1 .5-.5.85-1.4 1-2.7z"
      />
    </svg>
  );
}
