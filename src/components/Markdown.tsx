import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { copyText } from "../lib/store";
import type { Source } from "../lib/store";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

const mathToHtml = (tex: string, display: boolean): string => {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false });
  } catch {
    return `<code>${esc(tex)}</code>`;
  }
};

function inline(t: string, srcs?: Source[]): string {
  let s = esc(t);
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  // Display math first, then inline math (guarded so $5 / "$5 and $10" stay text).
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => `<div class="math-display">${mathToHtml(unesc(tex), true)}</div>`);
  s = s.replace(/\$([^$\n]+?)\$/g, (m, tex: string) => {
    const raw = unesc(tex);
    if (raw.length < 3 || !/[\\^_{}]/.test(raw)) return m;
    return mathToHtml(raw, false);
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img class="md-img" src="$2" alt="$1" loading="lazy" />');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  // Numbered citations bind to real search sources only — never bare [N].
  // Handles both [N] and model-emitted 【N†...】 footnote styles.
  if (srcs && srcs.length) {
    const byId = new Map(srcs.map((x) => [x.id, x]));
    const bind = (_m: string, n: string) => {
      const src = byId.get(Number(n));
      if (!src) return "";
      const title = esc(`${src.domain} — ${src.title}`).replace(/"/g, "&quot;");
      return `<sup class="cite"><a href="${esc(src.url)}" target="_blank" rel="noreferrer" title="${title}">${n}</a></sup>`;
    };
    s = s.replace(/\[(\d{1,2})\](?!\()/g, bind);
    s = s.replace(/【(\d{1,2})[^】]*】/g, bind);
  }
  return s;
}

import { Mermaid } from "./Mermaid";
export { Mermaid };

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const download = () => {
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "luca-snippet." + (lang || "txt");
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <pre>
      <div className="code-head">
        <span>{lang || "code"}</span>
        <span style={{ display: "inline-flex", gap: 4 }}>
          <button onClick={async () => { if (await copyText(code)) { setCopied(true); setTimeout(() => setCopied(false), 1400); } }}>
            {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy"}
          </button>
          <button onClick={download}>
            <Download size={13} />Download
          </button>
        </span>
      </div>
      <code>{code}</code>
    </pre>
  );
}

const isTableLine = (t: string) => t.includes("|") && t.split("|").filter((c) => c.trim()).length >= 2;
// GFM separator: each column needs one or more hyphens, optional alignment
// colons (|--|--|:--:|--:|---| all valid). Outer pipes optional.
const isSep = (t: string) => {
  const cs = t.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  return cs.length >= 2 && cs.every((c) => /^:?-+:?$/.test(c));
};
const cells = (t: string) => t.trim().replace(/^#+\s*/, "").replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

function InlineViz({ type, raw }: { type: string; raw: string }) {
  try {
    // xychart-beta is mermaid syntax, not JSON — route it to Mermaid even if tagged as chart
    if (raw.trim().startsWith("xychart-beta") || raw.trim().startsWith("xychart")) return <Mermaid code={raw} />;
    if (type === "mermaid") return <Mermaid code={raw} />;
    if (type === "chart") return <ChartBlock code={raw} />;
    if (type === "svg") {
      const sanitized = raw.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+="[^"]*"/gi, "").replace(/\son\w+='[^']*'/gi, "");
      if (!sanitized.trim().startsWith("<svg")) throw new Error("not svg");
      return <div className="inline-viz" dangerouslySetInnerHTML={{ __html: sanitized }} />;
    }
    return null;
  } catch (err) {
    console.error("[viz] InlineViz failed:", err, "type:", type, "raw:", raw.slice(0, 300));
    return <pre className="viz-fallback"><code>{raw}</code></pre>;
  }
}

function renderTable(headers: string[], rows: string[][], srcs?: Source[]): string {
  const th = headers.map((h) => `<th>${inline(h, srcs)}</th>`).join("");
  const tr = rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, srcs)}</td>`).join("")}</tr>`).join("");
  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

interface Block { type: "code" | "html" | "mermaid" | "chart" | "viz"; lang: string; content: string; vizType?: string }

interface ChartAnnotation { x: string; label: string }
interface ChartSpec { type: "bar" | "line" | "pie"; labels: string[]; values: number[]; title?: string; annotations?: ChartAnnotation[] }

function ChartBlock({ code }: { code: string }) {
  // xychart-beta is mermaid, not JSON chart — delegate to Mermaid with logging
  if (code.trim().startsWith("xychart-beta") || code.trim().startsWith("xychart")) {
    console.warn("[viz] ChartBlock received xychart mermaid syntax, delegating to Mermaid:", code.slice(0, 80));
    return <Mermaid code={code} />;
  }
  let spec: ChartSpec | null = null;
  try {
    let j = JSON.parse(code);
    if (j && j.data && Array.isArray(j.data.labels)) j = { type: j.type, labels: j.data.labels, values: j.data.values, title: j.title, annotations: j.annotations };
    if (j && (j.type === "bar" || j.type === "line" || j.type === "pie") &&
        Array.isArray(j.labels) && Array.isArray(j.values) && j.labels.length > 0) {
      const n = Math.min(j.labels.length, j.values.length, 8);
      const labels = j.labels.slice(0, n).map((l: unknown) => String(l));
      const values = j.values.slice(0, n).map((v: unknown) => Number(v)).filter((v: number) => Number.isFinite(v));
      if (values.length === n && n > 0) {
        let annotations: ChartAnnotation[] | undefined;
        if (Array.isArray(j.annotations)) {
          annotations = j.annotations
            .filter((a: unknown) => a && typeof (a as ChartAnnotation).x !== "undefined" && typeof (a as ChartAnnotation).label === "string")
            .slice(0, 5)
            .map((a: ChartAnnotation) => ({ x: String(a.x), label: String(a.label).slice(0, 60) }));
          if (annotations && !annotations.length) annotations = undefined;
        }
        spec = { type: j.type, labels, values, title: typeof j.title === "string" ? j.title : undefined, annotations };
      }
    }
  } catch (err) {
    console.error("[viz] ChartBlock JSON parse failed:", err, "code:", code.slice(0, 200));
  }
  if (!spec) {
    console.error("[viz] ChartBlock invalid spec, falling back to code:", code.slice(0, 200));
    return <pre><code>{code}</code></pre>;
  }
  const W = 560, H = 300, padL = 40, padB = 30, padT = 16;
  const plotW = W - padL - 12, plotH = H - padT - padB;
  const max = Math.max(...spec.values, 0) || 1;
  const X = (i: number) => padL + (plotW * (spec!.type === "line" ? i / Math.max(spec!.values.length - 1, 1) : (i + 0.5) / spec!.values.length));
  const Y = (v: number) => padT + plotH - (plotH * v) / max;
  const short = (l: string) => (l.length > 10 ? l.slice(0, 9) + "…" : l);
  // Event annotations: dashed vertical line at the matching x label with a
  // rotated text label. Bar/line only — meaningless on pie.
  const annotationLayer = spec.annotations && spec.type !== "pie" ? (
    <g>
      {spec.annotations.map((a, k) => {
        const i = spec!.labels.findIndex((l) => l === a.x);
        if (i < 0) return null;
        const lbl = a.label.length > 24 ? a.label.slice(0, 23) + "…" : a.label;
        return (
          <g key={k}>
            <title>{a.label}</title>
            <line x1={X(i)} x2={X(i)} y1={padT} y2={padT + plotH} style={{ stroke: "var(--ink-3)" }} strokeWidth={1} strokeDasharray="4 4" />
            <text x={X(i) + 5} y={padT + 5} fontSize={10} transform={`rotate(90 ${X(i) + 5} ${padT + 5})`} style={{ fill: "var(--ink-2)" }}>{lbl}</text>
          </g>
        );
      })}
    </g>
  ) : null;
  let body: React.ReactNode = null;
  if (spec.type === "bar") {
    const bw = (plotW / spec.values.length) * 0.55;
    body = (
      <g>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={padL} x2={W - 12} y1={padT + plotH * (1 - f)} y2={padT + plotH * (1 - f)} style={{ stroke: "var(--line-strong)", strokeWidth: 1 }} />
        ))}
        {spec.values.map((v, i) => (
          <g key={i}>
            <title>{spec!.labels[i]}: {v}</title>
            <rect x={X(i) - bw / 2} y={Y(v)} width={bw} height={Math.max(padT + plotH - Y(v), 2)} rx={3} style={{ fill: "var(--ink-2)" }} />
            <text x={X(i)} y={H - 8} textAnchor="middle" fontSize={10} style={{ fill: "var(--ink-3)" }}>{short(spec!.labels[i] ?? "")}</text>
          </g>
        ))}
        {annotationLayer}
      </g>
    );
  } else if (spec.type === "line") {
    const pts = spec.values.map((v, i) => `${X(i)},${Y(v)}`).join(" ");
    body = (
      <g>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={padL} x2={W - 12} y1={padT + plotH * (1 - f)} y2={padT + plotH * (1 - f)} style={{ stroke: "var(--line-strong)", strokeWidth: 1 }} />
        ))}
        <polyline points={pts} fill="none" style={{ stroke: "var(--ink)", strokeWidth: 2 }} strokeLinejoin="round" strokeLinecap="round" />
        {spec.values.map((v, i) => (
          <g key={i}>
            <title>{spec!.labels[i]}: {v}</title>
            <circle cx={X(i)} cy={Y(v)} r={3.5} style={{ fill: "var(--ink)" }} />
            <text x={X(i)} y={H - 8} textAnchor="middle" fontSize={10} style={{ fill: "var(--ink-3)" }}>{short(spec!.labels[i] ?? "")}</text>
          </g>
        ))}
        {annotationLayer}
      </g>
    );
  } else {
    const total = spec.values.reduce((a, b) => a + b, 0) || 1;
    const cx = 150, cy = H / 2, r = 95;
    let ang = -Math.PI / 2;
    const shades = [0.9, 0.7, 0.55, 0.42, 0.32, 0.24, 0.18, 0.12];
    body = (
      <g>
        {spec.values.map((v, i) => {
          const a0 = ang, a1 = ang + (v / total) * Math.PI * 2;
          ang = a1;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const d = `M ${cx} ${cy} L ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} Z`;
          return (
            <g key={i}>
              <title>{spec.labels[i]}: {v}</title>
              <path d={d} style={{ fill: "var(--ink)", opacity: shades[i % shades.length], stroke: "var(--bg)", strokeWidth: 2 }} />
            </g>
          );
        })}
        {spec.labels.map((l, i) => (
          <g key={i}>
            <rect x={280} y={40 + i * 26} width={12} height={12} rx={3} style={{ fill: "var(--ink)", opacity: shades[i % shades.length] }} />
            <text x={300} y={50 + i * 26} fontSize={12} style={{ fill: "var(--ink-2)" }}>{short(l)} ({spec!.values[i]})</text>
          </g>
        ))}
      </g>
    );
  }
  return (
    <div className="chart-block">
      {spec.title && <div className="chart-title">{spec.title}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={spec.title || "chart"}>{body}</svg>
    </div>
  );
}

function parse(md: string, srcs?: Source[]): Block[] {
  const out: Block[] = [];
  const parts = md.split("```");
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? "";
    if (i % 2 === 1) {
      const nl = part.indexOf("\n");
      const lang = (nl === -1 ? "" : part.slice(0, nl)).trim().toLowerCase();
      const code = (nl === -1 ? part : part.slice(nl + 1)).replace(/\n$/, "");
      let type: Block["type"] = "code";
      let vizType: string | undefined;
      if (lang === "mermaid" || lang === "viz:mermaid" || lang.startsWith("xychart") || lang === "viz:xychart" || lang === "viz:xychart-beta") type = "mermaid";
      else if (lang === "chart-data" || lang === "viz:chart") type = "chart";
      else if (lang === "viz:svg" || lang === "viz:html") { type = "viz"; vizType = lang.split(":")[1]; }
      out.push({ type, lang, content: code, vizType });
      continue;
    }
    const html = renderLines(parts[i] ?? "", srcs);
    if (html) out.push({ type: "html", lang: "", content: html });
  }
  return out;
}

function renderLines(text: string, srcs?: Source[]): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let ul: string[] = [], ol: string[] = [], q: string[] = [], p: string[] = [];
  const flush = () => {
    if (ul.length) { out.push("<ul>" + ul.map((l) => `<li>${inline(l, srcs)}</li>`).join("") + "</ul>"); ul = []; }
    if (ol.length) { out.push("<ol>" + ol.map((l) => `<li>${inline(l, srcs)}</li>`).join("") + "</ol>"); ol = []; }
    if (q.length) { out.push("<blockquote>" + q.map((l) => inline(l, srcs)).join("<br/>") + "</blockquote>"); q = []; }
    if (p.length) { out.push("<p>" + p.map((l) => inline(l, srcs)).join("<br/>") + "</p>"); p = []; }
  };
  for (let i = 0; i < lines.length; i++) {
    const t = (lines[i] ?? "").trimEnd();
    const s = t.trim();
    if (!s) { flush(); continue; }
    const h = s.match(/^(#{1,3})\s+(.*)/);
    if (h) { flush(); const hl = h[1]?.length ?? 1; out.push(`<h${hl}>${inline(h[2] ?? "", srcs)}</h${hl}>`); continue; }
    if (isTableLine(s)) {
      flush();
      const tl = [s];
      while (i + 1 < lines.length && isTableLine((lines[i + 1] ?? "").trim())) tl.push((lines[++i] ?? "").trim());
      if (tl.length >= 2 && isSep(tl[1] ?? "")) {
        const headers = cells(tl[0] ?? "");
        const rows = tl.slice(2).map(cells).map((r) => {
          while (r.length < headers.length) r.push("");
          return r.slice(0, headers.length);
        });
        out.push(renderTable(headers, rows, srcs));
      } else for (const x of tl) out.push(`<p>${inline(x, srcs)}</p>`);
      continue;
    }
    const um = s.match(/^[-*]\s+(.*)/);
    if (um) { ol = []; q = []; p = []; ul.push(um[1] ?? ""); continue; }
    const om = s.match(/^\d+\.\s+(.*)/);
    if (om) { ul = []; q = []; p = []; ol.push(om[1] ?? ""); continue; }
    if (s.startsWith("> ")) { ul = []; ol = []; p = []; q.push(s.slice(2)); continue; }
    ul = []; ol = []; q = []; p.push(s);
  }
  flush();
  return out.join("");
}

export default function Markdown({ text, sources }: { text: string; sources?: Source[] }) {
  const blocks = parse(text, sources);
  return (
    <div className="md">
      {blocks.map((b, i) =>
        b.type === "mermaid" ? <Mermaid key={i} code={b.content} />
        : b.type === "chart" ? <ChartBlock key={i} code={b.content} />
        : b.type === "viz" ? <InlineViz key={i} type={b.vizType || "svg"} raw={b.content} />
        : b.type === "code" ? <CodeBlock key={i} lang={b.lang} code={b.content} />
        : <div key={i} dangerouslySetInnerHTML={{ __html: b.content }} />
      )}
    </div>
  );
}
