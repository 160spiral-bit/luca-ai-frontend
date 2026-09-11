# Luca AI — frontend source (v2)

React + Vite + TypeScript multi-page app (`index.html` → landing/auth, `chat.html` → chat, `about.html` → about) with Barba.js page transitions. This repo mirrors the working source on every change.

## Layout

- `src/main.tsx` — boots a React root per Barba container, with a MutationObserver fallback so transitions never strand a blank page.
- `src/App.tsx` — all state: sessions, settings, tier, profile, auth, streaming, panels. Backend calls go through `src/lib/api.ts`.
- `src/components/` — `Sidebar`, `ChatArea` (thread, thinking indicator, citations, sources, follow-up chips), `Composer` (input pill, attachments, voice), `Markdown` (lazy-loaded: GFM tables, KaTeX math, SVG charts, mermaid, code blocks), `Panels` (Settings/Profile/Admin), `Auth` (split-screen sign in/up/verify/forgot/reset), `Logo` (brand spark, optional JS twinkle).
- `src/lib/store.ts` — types + localStorage keys (`luca-*`). `src/lib/api.ts` — SSE stream client (`EngineEvent`: reasoning/content/stage/sources/search-info/tool events/meta/done).
- `src/barba.ts` — Barba + GSAP transitions. `src/index.css` — all styling (dark luxe + designed light theme).

## Backend contract

`POST /api/chat` with `{ modelTier, messages, stream, tools, userSettings }` returns SSE `data:` lines (`content`, `reasoning`, `stage`+`label`, `sources`, `searchInfo`, `tool_calls`, `meta`, `[DONE]`). Auth is Bearer JWT (`luca-auth-token`). Per-account sync via `GET/POST /api/user/data`. Follow-ups via `POST /api/followups`.

## Build / deploy

`npm run build` → `dist/` (copied to the Render service repo root and the `luca-ai-web` GitHub Pages repo — those hold build output only; this repo is the source of truth).
