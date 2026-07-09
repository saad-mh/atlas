import { useMemo } from "react";
import { useCreatorStore } from "../store";
import { slugify } from "../slug";
import { emptyStep, flattenSteps, type DraftResource, type DraftStep, type StepKind, type VerifyType } from "../types";
import { ReadOnlyPreview } from "../ReadOnlyPreview";
import { ProcessView } from "../../views/ProcessView";
import { buildDraftStatus } from "../previewStatus";

const KIND_OPTIONS: StepKind[] = ["task", "group", "checkpoint"];
const VERIFY_OPTIONS: VerifyType[] = ["manual", "file_exists", "checksum"];

export function ProcessStep() {
  const draft = useCreatorStore((s) => s.draft);
  const addStep = useCreatorStore((s) => s.addStep);
  const flat = useMemo(() => flattenSteps(draft.steps), [draft.steps]);
  const flatIndex = useMemo(() => new Map(flat.map((s, i) => [s.key, i] as const)), [flat]);
  const previewStatus = useMemo(() => buildDraftStatus(draft), [draft]);

  return (
    <div className="creator-step">
      <h2>Process</h2>
      <p className="creator-step__hint">The steps that make up the build, in dependency order.</p>
      <p className="creator-step__note">
        A step can only depend on steps that already appear earlier in this list - reorder a step to
        change what it's allowed to depend on. Verify steps that run arbitrary shell commands
        (README §5.2 <code>command</code> type) aren't authorable from this wizard.
      </p>

      {draft.steps.length === 0 && <p className="empty-state">No steps yet.</p>}

      <div className="card-list">
        {draft.steps.map((step, i) => (
          <StepEditor
            key={step.key}
            step={step}
            index={i}
            count={draft.steps.length}
            resources={draft.resources}
            flatIndex={flatIndex}
            flat={flat}
          />
        ))}
      </div>

      <button type="button" className="add-button" onClick={() => addStep(emptyStep(), null)}>
        + Add step
      </button>

      {flat.length > 0 && (
        <ReadOnlyPreview label="Live process preview">
          <ProcessView status={previewStatus} onMark={() => { }} marking={null} />
        </ReadOnlyPreview>
      )}
    </div>
  );
}

function StepEditor({
  step,
  index,
  count,
  resources,
  flatIndex,
  flat,
}: {
  step: DraftStep;
  index: number;
  count: number;
  resources: DraftResource[];
  flatIndex: Map<string, number>;
  flat: DraftStep[];
}) {
  const updateStep = useCreatorStore((s) => s.updateStep);
  const removeStep = useCreatorStore((s) => s.removeStep);
  const reorderStep = useCreatorStore((s) => s.reorderStep);
  const addStep = useCreatorStore((s) => s.addStep);

  const handleTitleChange = (title: string) => {
    updateStep(step.key, step.idManual ? { title } : { title, id: slugify(title) });
  };
  const handleIdChange = (raw: string) => {
    const id = slugify(raw);
    if (id === "") updateStep(step.key, { id: slugify(step.title), idManual: false });
    else updateStep(step.key, { id, idManual: true });
  };

  const handleKindChange = (kind: StepKind) => {
    if (kind !== "group" && step.steps.length > 0) {
      const ok = window.confirm(
        `Changing "${step.title || "this step"}" to ${kind} will delete its ${step.steps.length} nested step(s). Continue?`,
      );
      if (!ok) return;
      updateStep(step.key, { kind, steps: [] });
      return;
    }
    updateStep(step.key, { kind });
  };

  const myIndex = flatIndex.get(step.key) ?? 0;
  const dependencyOptions = flat.filter((s) => (flatIndex.get(s.key) ?? 0) < myIndex);

  const toggleDependency = (key: string) => {
    const has = step.dependsOn.includes(key);
    updateStep(step.key, {
      dependsOn: has ? step.dependsOn.filter((k) => k !== key) : [...step.dependsOn, key],
    });
  };
  const toggleResource = (key: string) => {
    const has = step.requiresResources.includes(key);
    updateStep(step.key, {
      requiresResources: has ? step.requiresResources.filter((k) => k !== key) : [...step.requiresResources, key],
    });
  };

  return (
    <div className="card">
      <div className="card__header">
        <span className="card__title">{step.title || "Untitled step"}</span>
        <div className="card__actions">
          <button type="button" className="icon-button" disabled={index === 0} onClick={() => reorderStep(step.key, -1)} aria-label="Move up">
            ↑
          </button>
          <button type="button" className="icon-button" disabled={index === count - 1} onClick={() => reorderStep(step.key, 1)} aria-label="Move down">
            ↓
          </button>
          <button type="button" className="icon-button icon-button--danger" onClick={() => removeStep(step.key)} aria-label="Remove step">
            ✕
          </button>
        </div>
      </div>

      <div className="card__grid">
        <label className="field">
          <span className="field__label">Title</span>
          <input type="text" value={step.title} onChange={(e) => handleTitleChange(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Id</span>
          <input type="text" value={step.id} onChange={(e) => handleIdChange(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Kind</span>
          <select value={step.kind} onChange={(e) => handleKindChange(e.target.value as StepKind)}>
            {KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="sub-section">
        <span className="field__label">Depends on</span>
        {dependencyOptions.length === 0 ? (
          <p className="empty-state empty-state--inline">No earlier steps to depend on yet.</p>
        ) : (
          <div className="chip-select">
            {dependencyOptions.map((opt) => (
              <label key={opt.key} className={`chip${step.dependsOn.includes(opt.key) ? " chip--selected" : ""}`}>
                <input type="checkbox" checked={step.dependsOn.includes(opt.key)} onChange={() => toggleDependency(opt.key)} />
                {opt.title || "untitled"}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="sub-section">
        <span className="field__label">Requires resources</span>
        {resources.length === 0 ? (
          <p className="empty-state empty-state--inline">No resources declared yet.</p>
        ) : (
          <div className="chip-select">
            {resources.map((r) => (
              <label key={r.key} className={`chip${step.requiresResources.includes(r.key) ? " chip--selected" : ""}`}>
                <input type="checkbox" checked={step.requiresResources.includes(r.key)} onChange={() => toggleResource(r.key)} />
                {r.name || "untitled"}
              </label>
            ))}
          </div>
        )}
      </div>

      <label className="field">
        <span className="field__label">Instructions</span>
        <textarea value={step.instructions} onChange={(e) => updateStep(step.key, { instructions: e.target.value })} rows={3} />
      </label>

      <div className="card__grid">
        <label className="field">
          <span className="field__label">Verify</span>
          <select
            value={step.verify.type}
            onChange={(e) => updateStep(step.key, { verify: { ...step.verify, type: e.target.value as VerifyType } })}
          >
            {VERIFY_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {(step.verify.type === "file_exists" || step.verify.type === "checksum") && (
          <label className="field">
            <span className="field__label">Path</span>
            <input
              type="text"
              value={step.verify.path}
              onChange={(e) => updateStep(step.key, { verify: { ...step.verify, path: e.target.value } })}
            />
          </label>
        )}
        {step.verify.type === "checksum" && (
          <label className="field">
            <span className="field__label">Hash</span>
            <input
              type="text"
              value={step.verify.hash}
              onChange={(e) => updateStep(step.key, { verify: { ...step.verify, hash: e.target.value } })}
            />
          </label>
        )}
      </div>

      {step.kind === "group" && (
        <div className="nested-steps">
          <span className="field__label">Nested steps</span>
          {step.steps.map((child, i) => (
            <StepEditor
              key={child.key}
              step={child}
              index={i}
              count={step.steps.length}
              resources={resources}
              flatIndex={flatIndex}
              flat={flat}
            />
          ))}
          <button type="button" className="add-button add-button--nested" onClick={() => addStep(emptyStep(), step.key)}>
            + Add nested step
          </button>
        </div>
      )}
    </div>
  );
}
