import { useMemo, useState } from "react";
import type { AtsxStatus, Branch, Step, StepStatus } from "../types";
import { StatusDot, StatusSelect } from "../components/StatusBadge";

interface ProcessViewProps {
  status: AtsxStatus;
  onMark: (stepId: string, status: StepStatus) => void;
  marking: string | null;
}

export function ProcessView({ status, onMark, marking }: ProcessViewProps) {
  const { steps, branches } = status;
  // Local-only preview of an unmade branch choice: greys out the path not
  // picked without writing anything back (that's step 4's job, and even
  // then only an explicit mark does the writing - v1 doesn't persist
  // branch choices).
  const [preview, setPreview] = useState<Record<string, string>>({});
  const greyed = useMemo(() => computeGreyedSteps(steps, branches, preview), [steps, branches, preview]);
  const unresolved = branches.filter((b) => b.chosen === null);

  if (steps.length === 0) {
    return <p className="empty-state">No process steps declared.</p>;
  }

  return (
    <div className="process-view">
      {unresolved.map((branch) => (
        <div key={branch.id} className="branch-prompt">
          <div className="branch-prompt__question">{branch.question}</div>
          <div className="branch-prompt__options">
            {branch.options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`branch-option${preview[branch.id] === opt.value ? " branch-option--selected" : ""}`}
                onClick={() =>
                  setPreview((p) => {
                    const next = { ...p };
                    if (next[branch.id] === opt.value) {
                      delete next[branch.id];
                    } else {
                      next[branch.id] = opt.value;
                    }
                    return next;
                  })
                }
              >
                {opt.value}
              </button>
            ))}
          </div>
          <p className="branch-prompt__note">Preview only — not saved in this pass.</p>
        </div>
      ))}
      <div className="step-tree">
        {steps.map((step) => (
          <StepRow key={step.id} step={step} depth={0} greyed={greyed} onMark={onMark} marking={marking} />
        ))}
      </div>
    </div>
  );
}

function computeGreyedSteps(steps: Step[], branches: Branch[], preview: Record<string, string>): Set<string> {
  const greyed = new Set<string>();
  const flat: Step[] = [];
  const walk = (list: Step[]) => {
    for (const s of list) {
      flat.push(s);
      walk(s.steps);
    }
  };
  walk(steps);

  for (const step of flat) {
    if (!step.visible) {
      greyed.add(step.id); // a persisted branch choice already excludes this step
      continue;
    }
    for (const branch of branches) {
      if (branch.chosen !== null) continue;
      const chosenValue = preview[branch.id];
      if (!chosenValue) continue;
      const inChosenOption = branch.options.find((o) => o.value === chosenValue)?.chosen_step.includes(step.id) ?? false;
      const inOtherOption = branch.options.some((o) => o.value !== chosenValue && o.chosen_step.includes(step.id));
      if (inOtherOption && !inChosenOption) {
        greyed.add(step.id);
      }
    }
  }
  return greyed;
}

function StepRow({
  step,
  depth,
  greyed,
  onMark,
  marking,
}: {
  step: Step;
  depth: number;
  greyed: Set<string>;
  onMark: (stepId: string, status: StepStatus) => void;
  marking: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const isGroup = step.kind === "group";
  const hasDetail = Boolean(step.instructions) || step.attachments.length > 0 || isGroup;
  const isGreyed = greyed.has(step.id);
  const isBusy = marking === step.id;

  return (
    <div className={`step-row${isGreyed ? " step-row--greyed" : ""}`} style={{ marginLeft: depth * 24 }}>
      <div className="step-row__main">
        {hasDetail ? (
          <button className="disclosure" onClick={() => setExpanded((v) => !v)} aria-label="Toggle detail">
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="disclosure disclosure--spacer" />
        )}
        <input
          type="checkbox"
          className="step-checkbox"
          checked={step.status === "done"}
          disabled={isBusy}
          onChange={(e) => onMark(step.id, e.target.checked ? "done" : "todo")}
          aria-label={`Mark "${step.title}" done`}
        />
        <StatusDot status={step.status} />
        <span className="step-title">{step.title}</span>
        {isGroup && <span className="badge badge--group">group</span>}
        {step.kind === "checkpoint" && <span className="badge badge--checkpoint">checkpoint</span>}
        {step.verify.type !== "manual" && <span className="badge badge--verify">verify: {step.verify.type}</span>}
        <StatusSelect status={step.status} disabled={isBusy} onChange={(s) => onMark(step.id, s)} />
      </div>

      {(step.depends_on.length > 0 || step.requires_resources.length > 0) && (
        <div className="step-row__deps">
          {step.depends_on.length > 0 && <span>depends on: {step.depends_on.join(", ")}</span>}
          {step.requires_resources.length > 0 && <span>requires: {step.requires_resources.join(", ")}</span>}
        </div>
      )}

      {expanded && (
        <div className="step-row__detail">
          {step.instructions && <p className="step-instructions">{step.instructions}</p>}
          {step.attachments.length > 0 && (
            <ul className="step-attachments">
              {step.attachments.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
          {isGroup && step.steps.length > 0 && (
            <div className="step-children">
              {step.steps.map((child) => (
                <StepRow key={child.id} step={child} depth={depth + 1} greyed={greyed} onMark={onMark} marking={marking} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
