import barba from "@barba/core";
import gsap from "gsap";

// All page motion: Barba lifecycle + GSAP tweens. No CSS page animations.
const EASE = "power3.out";
const LEAVE = 0.26;
const ENTER = 0.38;
const reduced = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function barbaGo(href: "index.html" | "chat.html" | "about.html") {
  const cur = document.querySelector('[data-barba="container"]')?.getAttribute("data-barba-namespace");
  const want = href.startsWith("chat") ? "chat" : href.startsWith("about") ? "about" : "home";
  if (cur === want) return;
  const a = document.createElement("a");
  a.href = href;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function initBarba(onEnter?: () => void) {
  const w = window as unknown as { __lucaBarba?: boolean };
  if (w.__lucaBarba) return;
  w.__lucaBarba = true;
  const slide = (x: number) => ({
    leave(d: { current: { container: Element } }) {
      if (reduced()) return;
      return gsap.to(d.current.container, { autoAlpha: 0, x, duration: LEAVE, ease: "power2.out", overwrite: true });
    },
    enter(d: { next: { container: Element } }) {
      if (reduced()) return;
      return gsap.fromTo(d.next.container, { autoAlpha: 0, x: -x }, { autoAlpha: 1, x: 0, duration: ENTER, ease: EASE, overwrite: true, clearProps: "all" });
    },
  });
  barba.init({
    transitions: [
      { name: "fade", leave(d) { if (reduced()) return; return gsap.to(d.current.container, { autoAlpha: 0, y: -8, duration: LEAVE, ease: "power2.out", overwrite: true }); },
        enter(d) { if (reduced()) return; return gsap.fromTo(d.next.container, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: ENTER, ease: EASE, overwrite: true, clearProps: "all" }); },
        afterEnter() { onEnter?.(); } },
      { name: "home-chat", from: { namespace: ["home"] }, to: { namespace: ["chat"] }, ...slide(-14), afterEnter() { onEnter?.(); } },
      { name: "chat-home", from: { namespace: ["chat"] }, to: { namespace: ["home"] }, ...slide(14), afterEnter() { onEnter?.(); } },
    ],
    views: [
      { namespace: "home", afterEnter() { onEnter?.(); } },
      { namespace: "chat", afterEnter() { onEnter?.(); } },
      { namespace: "about", afterEnter() { onEnter?.(); } },
    ],
  });
}
