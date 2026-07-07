import type { StepStatus } from "../types";

export const STATUS_LABEL: Record<StepStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
  skipped: "Skipped",
};

const STATUS_ORDER: StepStatus[] = ["todo", "in_progress", "done", "blocked", "skipped"];

export function StatusDot({ status }: { status: StepStatus }) {
  return <span className={`status-dot status-dot--${status}`} title={STATUS_LABEL[status]} />;
}

export function StatusSelect({
  status,
  onChange,
  disabled,
}: {
  status: StepStatus;
  onChange: (status: StepStatus) => void;
  disabled?: boolean;
}) {
  return (
    <select
      className={`status-select status-select--${status}`}
      value={status}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value as StepStatus)}
    >
      {STATUS_ORDER.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
