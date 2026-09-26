// Pre-paint theme bootstrap (parser-blocking in <head>, runs before first
// render so there is no theme flash). Kept dependency-free on purpose.
// Single source of truth: luca-settings; onboarding is first-run fallback.
(function () {
  var theme = null;
  try {
    var s = localStorage.getItem("luca-settings"); if (s) { var sp = JSON.parse(s); if (sp && sp.theme) theme = sp.theme; }
    if (!theme) { var raw = localStorage.getItem("luca-onboarding"); if (raw) { var p = JSON.parse(raw); if (p && p.complete === true && p.theme) theme = p.theme; } }
  } catch (e) {}
  if (!theme) { theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"; }
  document.documentElement.setAttribute("data-theme", theme);
})();
