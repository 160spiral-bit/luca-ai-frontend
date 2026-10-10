import { useEffect, useState } from "react";

// Reactive mirror of documentElement's data-theme. Components that render
// theme-dependent output (Shiki highlighting, Mermaid diagrams) must re-render
// when the theme flips, or the user sees dark-mode code under a light UI.
export default function useTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");

  useEffect(() => {
    const ob = new MutationObserver(() =>
      setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"));
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => ob.disconnect();
  }, []);

  return theme;
}
