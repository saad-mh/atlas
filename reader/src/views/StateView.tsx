import type { AtsxStatus, Step, StepStatus } from "../types";
import { ProgressRing } from "../components/ProgressRing";
import { STATUS_LABEL } from "../components/StatusBadge";

const STATUS_ORDER: StepStatus[] = ["todo", "in_progress", "done", "blocked", "skipped"];

function countVisibleByStatus(steps: Step[]): Record<StepStatus, number> {
  const counts: Record<StepStatus, number> = { todo: 0, in_progress: 0, done: 0, blocked: 0, skipped: 0 };
  const walk = (list: Step[]) => {
    for (const s of list) {
      if (s.visible) counts[s.status]++;
      walk(s.steps);
    }
  };
  walk(steps);
  return counts;
}

export function StateView({ status }: { status: AtsxStatus }) {
  const { meta, warnings, progress_summary, state_instances, steps } = status;
  const byStatus = countVisibleByStatus(steps);

  return (
    <div className="state-view">
      {warnings.length > 0 && (
        <div className="banner banner--warning">
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}
      {state_instances.count > 1 && (
        <div className="banner banner--info">
          <p>
            {state_instances.count} build instances found in this file — showing{" "}
            <code>{state_instances.using ?? "the default"}</code>. Switching between instances isn't supported yet.
          </p>
        </div>
      )}

      <div className="state-summary">
        <ProgressRing percent={progress_summary.percent} />
        <div className="state-summary__text">
          <h2>{meta.title}</h2>
          <p className="state-summary__version">
            {meta.kind} · v{meta.version}
          </p>
          <p className="state-summary__count">
            {progress_summary.done} of {progress_summary.total} steps done
          </p>
        </div>
      </div>

      <div className="status-breakdown">
        {STATUS_ORDER.map((s) => (
          <div key={s} className="status-breakdown__item">
            <span className={`status-dot status-dot--${s}`} />
            <span className="status-breakdown__label">{STATUS_LABEL[s]}</span>
            <span className="status-breakdown__count">{byStatus[s]}</span>
          </div>
        ))}
      </div>

      {meta.description && <p className="state-description">{meta.description}</p>}

      <dl className="meta-grid">
        {meta.authors.length > 0 && (
          <>
            <dt>Authors</dt>
            <dd>{meta.authors.join(", ")}</dd>
          </>
        )}
        {meta.license && (
          <>
            <dt>License</dt>
            <dd>{meta.license}</dd>
          </>
        )}
        {meta.updated && (
          <>
            <dt>Updated</dt>
            <dd>{meta.updated}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
