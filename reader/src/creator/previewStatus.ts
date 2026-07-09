// Converts in-progress creator state into the exact AtsxStatus shape the
// existing reader views (ResourcesView, ProcessView) already know how to
// render - so the Review step (and the live DAG panel in the Process step)
// can reuse those views as a read-only preview instead of building a
// second renderer for the same data (see ../../views).

import type { AtsxStatus, Branch, Resource, Step, Verify } from "../types";
import type { CreatorDraft, DraftResource, DraftStep, DraftVerify } from "./types";
import { flattenSteps } from "./types";

function stepKeyToId(draft: CreatorDraft): Map<string, string> {
  const map = new Map<string, string>();
  flattenSteps(draft.steps).forEach((s) => map.set(s.key, s.id || `(step-${map.size + 1})`));
  return map;
}

function resourceKeyToId(draft: CreatorDraft): Map<string, string> {
  const map = new Map<string, string>();
  draft.resources.forEach((r) => map.set(r.key, r.id || `(resource-${map.size + 1})`));
  return map;
}

function toPreviewVerify(v: DraftVerify): Verify {
  if (v.type === "file_exists") return { type: "file_exists", path: v.path };
  if (v.type === "checksum") return { type: "checksum", path: v.path, hash: v.hash };
  return { type: "manual" };
}

function toPreviewResource(r: DraftResource): Resource {
  const quantity = r.type === "hardware" && r.quantity.trim() !== "" ? Number(r.quantity) : null;
  return {
    id: r.id || "(untitled)",
    type: r.type,
    name: r.name || "Untitled resource",
    quantity: Number.isFinite(quantity) ? quantity : null,
    unit: r.type === "hardware" && r.unit.trim() !== "" ? r.unit : null,
    bundle: null,
    source: r.source.trim() !== "" ? r.source : null,
    required: r.required,
    substitutes: r.substitutes
      .filter((s) => s.name.trim() !== "")
      .map((s) => ({ name: s.name, note: s.note.trim() !== "" ? s.note : undefined })),
    part_of: null,
    kind: null,
    spec_ref: null,
  };
}

function toPreviewStep(
  s: DraftStep,
  idOf: Map<string, string>,
  resourceIdOf: Map<string, string>,
): Step {
  return {
    id: idOf.get(s.key) ?? s.key,
    title: s.title || "Untitled step",
    kind: s.kind,
    depends_on: s.dependsOn.map((k) => idOf.get(k) ?? k),
    requires_resources: s.requiresResources.map((k) => resourceIdOf.get(k) ?? k),
    instructions: s.instructions.trim() !== "" ? s.instructions : null,
    attachments: [],
    verify: toPreviewVerify(s.verify),
    status: "todo",
    completed_at: null,
    notes: null,
    visible: true,
    steps: s.steps.map((child) => toPreviewStep(child, idOf, resourceIdOf)),
  };
}

function toPreviewBranch(
  b: CreatorDraft["branches"][number],
  idOf: Map<string, string>,
): Branch {
  return {
    id: b.id || "(untitled)",
    question: b.question,
    options: b.options.map((o) => ({
      value: o.value,
      chosen_step: o.activatesSteps.map((k) => idOf.get(k) ?? k),
    })),
    chosen: null,
  };
}

export function buildDraftStatus(draft: CreatorDraft): AtsxStatus {
  const idOf = stepKeyToId(draft);
  const resourceIdOf = resourceKeyToId(draft);
  const flat = flattenSteps(draft.steps);

  return {
    path: "(unsaved draft)",
    meta: {
      id: draft.meta.id || "(untitled)",
      title: draft.meta.title || "Untitled build",
      kind: draft.meta.kind,
      version: draft.meta.version,
      authors: draft.meta.authors.filter((a) => a.trim() !== ""),
      license: draft.meta.license.trim() !== "" ? draft.meta.license : null,
      description: draft.meta.description.trim() !== "" ? draft.meta.description : null,
      created: null,
      updated: null,
    },
    warnings: [],
    state_instances: { count: 0, names: [], using: null },
    resources: draft.resources.map(toPreviewResource),
    steps: draft.steps.map((s) => toPreviewStep(s, idOf, resourceIdOf)),
    branches: draft.branches.map((b) => toPreviewBranch(b, idOf)),
    progress_summary: { total: flat.length, done: 0, percent: 0 },
  };
}
