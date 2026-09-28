import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import "./index.css";
import App from "./App";
import { About } from "./pages";

// HashRouter, not BrowserRouter: static hosting (Pages subpath + Vercel)
// serves a single index.html with no server rewrites, so path URLs would
// 404 and relative asset paths would break under /chat. Hash routes keep
// ./assets/... resolving everywhere with zero server config.
function AnimatedRoutes() {
  return (
    <main className="route-enter">
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/chat" element={<App />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<App />} />
      </Routes>
    </main>
  );
}

console.log(`[Luca] build ${__BUILD_ID__}`);

// Single Toaster for the whole app, hoisted above every route and every App
// early-return branch (auth, onboarding, logout all toast into branches that
// render no Toaster of their own). Theme follows documentElement's data-theme,
// which App owns, via a MutationObserver — no React state needed up here.
function ThemedToaster() {
  const [theme, setTheme] = React.useState<"light" | "dark">(() =>
    document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
  React.useEffect(() => {
    const ob = new MutationObserver(() =>
      setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"));
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => ob.disconnect();
  }, []);
  return <Toaster position="bottom-center" theme={theme} toastOptions={{ duration: 2400 }} />;
}

// Last-resort render guard. Suspense covers loading failures, not render
// errors — without this, one throw in Markdown/ChartBlock/greetingStats blanks
// the app with the user's chats still in IndexedDB and no UI to reach them.
class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.error("[Luca] render crash:", err); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="center-page">
        <div className="auth-card" role="alert">
          <h1>Something broke</h1>
          <p className="sub">The app hit an unexpected error. Your chats are saved on this device.</p>
          <button className="btn-primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <RootErrorBoundary>
        <AnimatedRoutes />
      </RootErrorBoundary>
      {/* Hoisted above every route and every App early-return branch, so toasts
          from auth, onboarding and logout are never fired into a branch that
          does not render one. */}
      <ThemedToaster />
    </HashRouter>
  </React.StrictMode>
);
