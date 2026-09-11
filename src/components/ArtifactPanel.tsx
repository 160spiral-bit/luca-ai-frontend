import { useState } from "react";
import { Mermaid } from "./Markdown";
import type { Artifact } from "../lib/store";

function CodeView({ code, language }: { code: string; language: string }) {
  return <pre style={{ margin: 0, padding: 16, overflow: "auto" }}><code>{code}</code><div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 8 }}>{language}</div></pre>;
}
function ArtifactPreview({ type, content }: { type: string; content: string }) {
  if (type === "html" || type === "svg") {
    return <iframe sandbox="allow-scripts" srcDoc={content} className="artifact-iframe" title="Artifact preview" />;
  }
  if (type === "markdown") {
    // simple markdown fallback — reuse same container styling
    return <div style={{ padding: 16, whiteSpace: "pre-wrap", fontSize: 14 }}>{content}</div>;
  }
  if (type === "mermaid" || content.trim().startsWith("xychart")) {
    return <div style={{ padding: 16 }}><Mermaid code={content} /></div>;
  }
  return <CodeView code={content} language={type} />;
}
function VersionScrubber({ versions, index, onChange }: { versions: Artifact["versions"]; index: number; onChange: (i: number) => void }) {
  if (versions.length <= 1) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--line)" }}>
      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>v{index + 1}/{versions.length}</span>
      <input type="range" min={0} max={versions.length - 1} value={index} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1 }} />
    </div>
  );
}
export default function ArtifactPanel({ artifact, onClose }: { artifact: Artifact; onClose: () => void }) {
  const [view, setView] = useState<"preview" | "code">("preview");
  const [versionIdx, setVersionIdx] = useState(artifact.versions.length - 1);
  const version = artifact.versions[versionIdx] || artifact.versions[artifact.versions.length - 1];
  // Keep index at latest when new version arrives
  if (versionIdx > artifact.versions.length - 1) setVersionIdx(artifact.versions.length - 1);
  return (
    <div className="artifact-panel">
      <div className="artifact-panel__header">
        <span className="artifact-panel__title">{artifact.title}</span>
        <div className="artifact-panel__tabs">
          <button onClick={() => setView("preview")} aria-pressed={view === "preview"}>Preview</button>
          <button onClick={() => setView("code")} aria-pressed={view === "code"}>Code</button>
          <button onClick={onClose} aria-label="Close artifact" style={{ marginLeft: 8 }}>✕</button>
        </div>
      </div>
      <VersionScrubber versions={artifact.versions} index={versionIdx} onChange={setVersionIdx} />
      <div className="artifact-panel__body">
        {view === "preview" ? <ArtifactPreview type={artifact.artifactType} content={version.content} /> : <CodeView code={version.content} language={artifact.artifactType} />}
      </div>
    </div>
  );
}
