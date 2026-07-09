import { useMemo } from "react";
import { useCreatorStore } from "../store";
import { slugify } from "../slug";
import { emptyBranch, emptyBranchOption, flattenSteps, type DraftBranch, type DraftBranchOption } from "../types";

export function BranchesStep() {
  const branches = useCreatorStore((s) => s.draft.branches);
  const steps = useCreatorStore((s) => s.draft.steps);
  const addBranch = useCreatorStore((s) => s.addBranch);
  const flatSteps = useMemo(() => flattenSteps(steps), [steps]);

  return (
    <div className="creator-step">
      <h2>Branches</h2>
      <p className="creator-step__hint">
        Optional. Only add branches if this build actually forks on a real-world choice - fabrication
        method, platform, available tools. Skip this step entirely if it doesn't.
      </p>

      {branches.length === 0 && <p className="empty-state">No branches yet - that's fine, skip ahead.</p>}

      <div className="card-list">
        {branches.map((branch) => (
          <BranchCard key={branch.key} branch={branch} flatSteps={flatSteps} />
        ))}
      </div>

      <button type="button" className="add-button" onClick={() => addBranch(emptyBranch())}>
        + Add branch
      </button>
    </div>
  );
}

function BranchCard({
  branch,
  flatSteps,
}: {
  branch: DraftBranch;
  flatSteps: ReturnType<typeof flattenSteps>;
}) {
  const updateBranch = useCreatorStore((s) => s.updateBranch);
  const removeBranch = useCreatorStore((s) => s.removeBranch);

  const handleQuestionChange = (question: string) => {
    updateBranch(branch.key, branch.idManual ? { question } : { question, id: slugify(question) });
  };
  const handleIdChange = (raw: string) => {
    const id = slugify(raw);
    if (id === "") updateBranch(branch.key, { id: slugify(branch.question), idManual: false });
    else updateBranch(branch.key, { id, idManual: true });
  };

  const updateOption = (key: string, patch: Partial<DraftBranchOption>) =>
    updateBranch(branch.key, {
      options: branch.options.map((o) => (o.key === key ? { ...o, ...patch } : o)),
    });
  const addOption = () => updateBranch(branch.key, { options: [...branch.options, emptyBranchOption()] });
  const removeOption = (key: string) =>
    updateBranch(branch.key, { options: branch.options.filter((o) => o.key !== key) });
  const toggleStep = (optionKey: string, stepKey: string) => {
    const option = branch.options.find((o) => o.key === optionKey);
    if (!option) return;
    const has = option.activatesSteps.includes(stepKey);
    updateOption(optionKey, {
      activatesSteps: has ? option.activatesSteps.filter((k) => k !== stepKey) : [...option.activatesSteps, stepKey],
    });
  };

  return (
    <div className="card">
      <div className="card__header">
        <span className="card__title">{branch.question || "Untitled branch"}</span>
        <div className="card__actions">
          <button type="button" className="icon-button icon-button--danger" onClick={() => removeBranch(branch.key)} aria-label="Remove branch">
            ✕
          </button>
        </div>
      </div>

      <div className="card__grid">
        <label className="field field--wide">
          <span className="field__label">Question</span>
          <input
            type="text"
            value={branch.question}
            onChange={(e) => handleQuestionChange(e.target.value)}
            placeholder="How will you fabricate the mount?"
          />
        </label>
        <label className="field">
          <span className="field__label">Id</span>
          <input type="text" value={branch.id} onChange={(e) => handleIdChange(e.target.value)} />
        </label>
      </div>

      <div className="sub-section">
        <span className="field__label">Options</span>
        {branch.options.map((option) => (
          <div className="branch-option-editor" key={option.key}>
            <div className="repeatable-list__row">
              <input
                type="text"
                value={option.value}
                onChange={(e) => updateOption(option.key, { value: e.target.value })}
                placeholder="option value, e.g. 3d-print"
              />
              <button type="button" className="icon-button" onClick={() => removeOption(option.key)} aria-label="Remove option">
                ✕
              </button>
            </div>
            {flatSteps.length === 0 ? (
              <p className="empty-state empty-state--inline">No process steps declared yet.</p>
            ) : (
              <div className="chip-select">
                {flatSteps.map((step) => (
                  <label
                    key={step.key}
                    className={`chip${option.activatesSteps.includes(step.key) ? " chip--selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={option.activatesSteps.includes(step.key)}
                      onChange={() => toggleStep(option.key, step.key)}
                    />
                    {step.title || "untitled"}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
        <button type="button" className="link-button" onClick={addOption}>
          + Add option
        </button>
      </div>
    </div>
  );
}
