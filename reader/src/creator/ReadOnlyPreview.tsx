import type { ReactNode } from "react";

/** Wraps an existing reader view (ResourcesView/ProcessView) so it can be
 * reused, unmodified, as a read-only preview against in-progress draft
 * data - `pointer-events: none` keeps its interactive bits (checkboxes,
 * status selects, branch-preview buttons) from looking clickable when they
 * wouldn't actually persist anything here. */
export function ReadOnlyPreview({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="creator-preview">
      <div className="creator-preview__label">{label}</div>
      <div className="creator-preview__frame">{children}</div>
    </div>
  );
}
