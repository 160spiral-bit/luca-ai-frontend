import { Suspense, lazy, useId, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import CodeBlock from "./CodeBlock";
import type { Artifact, ArtifactVersion } from "../lib/store";

const Mermaid = lazy(() => import("./Mermaid").then((m) => ({ default: m.Mermaid })));

function CodeView({ code, language }: { code: string; language: string }) {
  return (
    <div className="artifact-code">
      <CodeBlock lang={language} code={code} />
    </div>
  );
}
// The sandbox attribute already contains scripts (no allow-same-origin, so no
// parent DOM/storage access). This meta tag is defense-in-depth for engines
// where the iframe csp attribute is unsupported (Firefox/Safari): no network,
// no plugins, images data/blob only.
const ARTIFACT_CSP = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: blob:; font-src data:; connect-src \'none\'; media-src data: blob:">';
function withCsp(content: string): string {
  if (/<head[^>]*>/i.test(content)) return content.replace(/<head[^>]*>/i, (m) => `${m}${ARTIFACT_CSP}`);
  if (/<html[^>]*>/i.test(content)) return content.replace(/<html[^>]*>/i, (m) => `${m}<head>${ARTIFACT_CSP}</head>`);
  return `<head>${ARTIFACT_CSP}</head>` + content;
}
function ArtifactPreview({ type, content }: { type: string; content: string }) {
  if (type === "html" || type === "svg") {
    // Both branches get the CSP meta: the iframe `csp` attribute is unsupported
    // in Firefox/Safari, so an untrusted svg could otherwise phone home.
    const doc = withCsp(content);
    return (
      <iframe
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        {...{ csp: "default-src 'none'; style-src 'unsafe-inline'; img-src data:" }}
        srcDoc={doc}
        className="artifact-iframe"
        title="Artifact preview"
      />
    );
  }
  if (type === "markdown") {
    // simple markdown fallback — reuse same container styling
    return <div className="artifact-md">{content}</div>;
  }
  if (type === "mermaid" || content.trim().startsWith("xychart")) {
    return <div className="artifact-mermaid"><Suspense fallback={<pre>{content}</pre>}><Mermaid code={content} /></Suspense></div>;
  }
  return <CodeView code={content} language={type} />;
}
function VersionScrubber({ versions, index, onChange }: { versions: Artifact["versions"]; index: number; onChange: (i: number) => void }) {
  if (versions.length <= 1) return null;
  return (
    <div className="version-scrubber">
      <span className="version-scrubber__label">v{index + 1}/{versions.length}</span>
      <input type="range" min={0} max={versions.length - 1} value={index} onChange={(e) => onChange(Number(e.target.value))} className="version-scrubber__range" aria-label="Artifact version" />
    </div>
  );
}
export default function ArtifactPanel({ artifact, onClose }: { artifact: Artifact; onClose: () => void }) {
  const descId = useId();
  const [view, setView] = useState<"preview" | "code">("preview");
  // Follow the latest unless the user scrubbed back (pinned). No setState
  // during render; combined with key={artifact.id} this never shows stale v1.
  const [pinned, setPinned] = useState<number | null>(null);
  const lastIdx = artifact.versions.length - 1;
  const versionIdx = pinned === null || pinned > lastIdx ? lastIdx : pinned;
  const version: ArtifactVersion = artifact.versions[versionIdx] || artifact.versions[lastIdx] || { version: 0, content: "", createdAt: "" };
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        <Dialog.Content className="artifact-panel" aria-describedby={descId}>
          <Dialog.Title className="sr-only">{artifact.title || "Artifact preview"}</Dialog.Title>
          <Dialog.Description className="sr-only" id={descId}>
            Artifact preview for {artifact.title || "untitled artifact"}. Use Preview and Code tabs to inspect versions.
          </Dialog.Description>
    <div className="artifact-panel__header">
        <span className="artifact-panel__title" aria-hidden="true">{artifact.title}</span>
        <div className="artifact-panel__tabs">
          <button type="button" onClick={() => setView("preview")} aria-pressed={view === "preview"}>Preview</button>
          <button type="button" onClick={() => setView("code")} aria-pressed={view === "code"}>Code</button>
          <Dialog.Close className="icon-btn artifact-close" aria-label="Close artifact">
            <X size={16} />
          </Dialog.Close>
        </div>
      </div>
      <div className="artifact-versions">
        <div className="artifact-versions__main">
          <VersionScrubber versions={artifact.versions} index={versionIdx} onChange={setPinned} />
        </div>
        {pinned !== null && pinned < lastIdx && (
          <button className="mini-btn" onClick={() => setPinned(null)}>Latest</button>
        )}
      </div>
      <div className="artifact-panel__body">
        {view === "preview" ? <ArtifactPreview type={artifact.artifactType} content={version.content} /> : <CodeView code={version.content} language={artifact.artifactType} />}
      </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
