import { useEffect } from "react";
import type { AuthUser } from "../lib/store";

// DEV-only layout inspector (?debug=layout): outlines shell regions and
// prints a geometry report. Extracted from App.tsx to keep it under budget.
export function useLayoutDebug(authUser: AuthUser | null, guest: boolean) {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let qs: URLSearchParams | null = null;
    try { qs = new URLSearchParams(window.location.search); } catch { return; }
    if (!qs || !String(qs.get("debug") || "").includes("layout")) return;
    const t = window.setTimeout(() => {
      const colors = ["red", "lime", "cyan", "magenta", "orange", "yellow"];
      const sels = [".sidebar", ".main", ".home", ".conv", ".hero", ".hero .composer-zone", ".conv .composer-zone", ".composer", ".thread-inner"];
      const rows = sels.map((sel, i) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return { sel, status: "MISSING" };
        const r = el.getBoundingClientRect();
        el.style.outline = `2px solid ${colors[i % colors.length]}`;
        return {
          sel, left: Math.round(r.left), width: Math.round(r.width),
          center: Math.round(r.left + r.width / 2), display: getComputedStyle(el).display,
        };
      });
      const box = document.createElement("div");
      box.style.cssText = "position:fixed;bottom:8px;right:8px;z-index:9999;background:#000;color:#0f0;font:11px/1.5 monospace;padding:10px 12px;border:1px solid #0f0;white-space:pre;max-width:60vw;max-height:50dvh;overflow:auto;";
      box.textContent = `VIEWPORT ${window.innerWidth}\n` + rows
        .map((r) => ("status" in r ? `${r.sel} MISSING` : `${r.sel} left=${r.left} w=${r.width} center=${r.center} d=${r.display}`))
        .join("\n");
      if (document.getElementById("luca-debug-report")) document.getElementById("luca-debug-report")!.remove();
      box.id = "luca-debug-report";
      document.body.appendChild(box);
    }, 800);
    return () => window.clearTimeout(t);
  }, [authUser, guest]);
}
