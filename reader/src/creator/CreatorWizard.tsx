import { useState } from "react";
import { useCreatorStore } from "./store";
import { MetaStep } from "./steps/MetaStep";
import { ResourcesStep } from "./steps/ResourcesStep";
import { ProcessStep } from "./steps/ProcessStep";
import { BranchesStep } from "./steps/BranchesStep";
import { ReviewStep } from "./steps/ReviewStep";

const STEPS = ["Meta", "Resources", "Process", "Branches", "Review & Export"] as const;

export function CreatorWizard({
  onExit,
  onOpenExported,
}: {
  onExit: () => void;
  onOpenExported: (path: string) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const title = useCreatorStore((s) => s.draft.meta.title);

  const canAdvance = stepIndex !== 0 || title.trim() !== "";

  return (
    <div className="creator">
      <aside className="creator-stepper">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            className={`creator-stepper__item${i === stepIndex ? " creator-stepper__item--active" : ""}`}
            onClick={() => setStepIndex(i)}
          >
            <span className="creator-stepper__index">{i + 1}</span>
            {label}
          </button>
        ))}
        <button type="button" className="creator-stepper__exit" onClick={onExit}>
          ← Back to home
        </button>
      </aside>

      <div className="creator-body">
        {stepIndex === 0 && <MetaStep />}
        {stepIndex === 1 && <ResourcesStep />}
        {stepIndex === 2 && <ProcessStep />}
        {stepIndex === 3 && <BranchesStep />}
        {stepIndex === 4 && <ReviewStep onOpenExported={onOpenExported} />}

        <div className="creator-nav">
          <button type="button" className="secondary-button" disabled={stepIndex === 0} onClick={() => setStepIndex((i) => i - 1)}>
            Back
          </button>
          {stepIndex < STEPS.length - 1 && (
            <button
              type="button"
              className="open-button"
              disabled={!canAdvance}
              onClick={() => setStepIndex((i) => i + 1)}
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
