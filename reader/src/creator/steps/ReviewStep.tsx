import { useMemo, useState } from "react";
import { useCreatorStore } from "../store";
import { buildDraftStatus } from "../previewStatus";
import { buildManifestYaml } from "../manifestYaml";
import { exportAtsx, pickSavePath } from "../api";
import { ReadOnlyPreview } from "../ReadOnlyPreview";
import { ResourcesView } from "../../views/ResourcesView";
import { ProcessView } from "../../views/ProcessView";

type ExportState =
  | { phase: "idle" }
  | { phase: "exporting" }
  | { phase: "success"; path: string }
  | { phase: "error"; message: string };

export function ReviewStep({ onOpenExported }: { onOpenExported: (path: string) => void }) {
  const draft = useCreatorStore((s) => s.draft);
  const status = useMemo(() => buildDraftStatus(draft), [draft]);
  const [exportState, setExportState] = useState<ExportState>({ phase: "idle" });

  const handleExport = async () => {
    setExportState({ phase: "idle" });
    let outputPath: string | null;
    try {
      outputPath = await pickSavePath(draft.meta.id);
    } catch (e) {
      setExportState({ phase: "error", message: String(e) });
      return;
    }
    if (!outputPath) return;

    setExportState({ phase: "exporting" });
    try {
      const manifestYaml = buildManifestYaml(draft);
      const path = await exportAtsx(manifestYaml, outputPath);
      setExportState({ phase: "success", path });
    } catch (e) {
      setExportState({ phase: "error", message: String(e) });
    }
  };

  return (
    <div className="creator-step">
      <h2>Review &amp; Export</h2>
      <p className="creator-step__hint">
        This is exactly what a recipient will see when they open the exported file.
      </p>

      <div className="review-meta">
        <h3>{status.meta.title || "Untitled build"}</h3>
        <p className="review-meta__line">
          {status.meta.kind} · v{status.meta.version}
          {status.meta.authors.length > 0 && <> · {status.meta.authors.join(", ")}</>}
          {status.meta.license && <> · {status.meta.license}</>}
        </p>
        {status.meta.description && <p className="review-meta__description">{status.meta.description}</p>}
      </div>

      <ReadOnlyPreview label="Resources">
        <ResourcesView resources={status.resources} />
      </ReadOnlyPreview>

      <ReadOnlyPreview label="Process">
        <ProcessView status={status} onMark={() => {}} marking={null} />
      </ReadOnlyPreview>

      <div className="export-panel">
        <button type="button" className="open-button" onClick={handleExport} disabled={exportState.phase === "exporting"}>
          {exportState.phase === "exporting" ? "Exporting…" : "Export .atsx"}
        </button>

        {exportState.phase === "success" && (
          <div className="banner banner--success">
            <p>Exported to {exportState.path}</p>
            <button type="button" className="link-button" onClick={() => onOpenExported(exportState.path)}>
              Open in reader
            </button>
          </div>
        )}

        {exportState.phase === "error" && (
          <div className="banner banner--error banner--pre">
            <pre>{exportState.message}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
