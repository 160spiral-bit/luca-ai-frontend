import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { About } from "./pages";
import { initBarba } from "./barba";

const mounted = new WeakSet<Element>();

function mount(el: Element) {
  if (mounted.has(el)) return;
  const ns = el.getAttribute("data-barba-namespace");
  if (ns === "about") {
    mounted.add(el);
    ReactDOM.createRoot(el as HTMLElement).render(<About />);
    return;
  }
  let target = el.id === "root" ? (el as HTMLElement) : (el.querySelector("#root") as HTMLElement | null) || (el as HTMLElement);
  if ((target as HTMLElement).dataset.booted === "1") return;
  (target as HTMLElement).dataset.booted = "1";
  mounted.add(el);
  ReactDOM.createRoot(target).render(
    <React.StrictMode>
      <App namespace={ns || "home"} />
    </React.StrictMode>
  );
}

const initial = document.querySelector('[data-barba="container"]');
if (initial) mount(initial);
if (document.querySelector('[data-barba="wrapper"]')) {
  initBarba(() => {
    const el = document.querySelector('[data-barba="container"]');
    if (el) mount(el);
  });
  // Fallback: Barba hook timing isn't fully reliable (container swaps have
  // been observed without afterEnter firing). Mount any unmounted container
  // whenever the DOM changes, so a page can never strand blank.
  const ensureMounted = () => {
    document.querySelectorAll('[data-barba="container"]').forEach((el) => {
      const root = el.id === "root" ? (el as HTMLElement) : (el.querySelector("#root") as HTMLElement | null);
      if (root && root.dataset.booted !== "1") mount(el);
    });
  };
  new MutationObserver(ensureMounted).observe(document.body, { childList: true, subtree: true });
}
