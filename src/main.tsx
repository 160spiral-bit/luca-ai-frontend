import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router-dom";
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
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <AnimatedRoutes />
    </HashRouter>
  </React.StrictMode>
);
