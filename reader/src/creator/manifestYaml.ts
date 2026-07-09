// Serializes a CreatorDraft into the real manifest.atsx.yaml text (README §3).
// This is plain data serialization, not validation or packing - those stay
// the CLI's job (see api.ts / the Rust `export_atsx` command), per the
// architecture decision to reuse `atlas pack` rather than reimplement it.

import { dump } from "js-yaml";
import { flattenSteps, type CreatorDraft, type DraftBranch, type DraftResource, type DraftStep } from "./types";

function stepKeyToId(draft: CreatorDraft): Map<string, string> {
  const map = new Map<string, string>();
  flattenSteps(draft.steps).forEach((s) => map.set(s.key, s.id));
  return map;
}

function resourceKeyToId(draft: CreatorDraft): Map<string, string> {
  const map = new Map<string, string>();
  draft.resources.forEach((r) => map.set(r.key, r.id));
  return map;
}

function buildResource(r: DraftResource): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: r.id,
    type: r.type,
    name: r.name,
  };
  if (r.type === "hardware") {
    const quantity = Number(r.quantity);
    if (r.quantity.trim() !== "" && Number.isFinite(quantity)) out.quantity = quantity;
    if (r.unit.trim() !== "") out.unit = r.unit;
  }
  out.required = r.required;
  if (r.source.trim() !== "") out.source = r.source;
  const substitutes = r.substitutes
    .filter((s) => s.name.trim() !== "")
    .map((s) => (s.note.trim() !== "" ? { name: s.name, note: s.note } : { name: s.name }));
  if (substitutes.length > 0) out.substitutes = substitutes;
  return out;
}

function buildStep(
  s: DraftStep,
  idOf: Map<string, string>,
  resourceIdOf: Map<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: s.id,
    title: s.title,
    depends_on: s.dependsOn.map((k) => idOf.get(k)).filter((v): v is string => Boolean(v)),
  };
  const requiresResources = s.requiresResources.map((k) => resourceIdOf.get(k)).filter((v): v is string => Boolean(v));
  if (requiresResources.length > 0) out.requires_resources = requiresResources;
  out.kind = s.kind;
  if (s.instructions.trim() !== "") out.instructions = s.instructions;

  const verify: Record<string, unknown> = { type: s.verify.type };
  if (s.verify.type === "file_exists" || s.verify.type === "checksum") {
    if (s.verify.path.trim() !== "") verify.path = s.verify.path;
  }
  if (s.verify.type === "checksum" && s.verify.hash.trim() !== "") verify.hash = s.verify.hash;
  out.verify = verify;

  if (s.kind === "group" && s.steps.length > 0) {
    out.steps = s.steps.map((child) => buildStep(child, idOf, resourceIdOf));
  }
  return out;
}

function buildBranch(b: DraftBranch, idOf: Map<string, string>): Record<string, unknown> {
  return {
    id: b.id,
    question: b.question,
    options: b.options.map((o) => ({
      value: o.value,
      chosen_step: o.activatesSteps.map((k) => idOf.get(k)).filter((v): v is string => Boolean(v)),
    })),
  };
}

export function buildManifestObject(draft: CreatorDraft): Record<string, unknown> {
  const idOf = stepKeyToId(draft);
  const resourceIdOf = resourceKeyToId(draft);

  const meta: Record<string, unknown> = {
    id: draft.meta.id,
    title: draft.meta.title,
    kind: draft.meta.kind,
    version: draft.meta.version,
  };
  const authors = draft.meta.authors.filter((a) => a.trim() !== "");
  if (authors.length > 0) meta.authors = authors;
  if (draft.meta.license.trim() !== "") meta.license = draft.meta.license;
  if (draft.meta.description.trim() !== "") meta.description = draft.meta.description;

  const manifest: Record<string, unknown> = {
    atlas_version: "0.1",
    meta,
    resources: draft.resources.map(buildResource),
    process: draft.steps.map((s) => buildStep(s, idOf, resourceIdOf)),
  };
  if (draft.branches.length > 0) {
    manifest.branches = draft.branches.map((b) => buildBranch(b, idOf));
  }
  return manifest;
}

export function buildManifestYaml(draft: CreatorDraft): string {
  return dump(buildManifestObject(draft), { lineWidth: 100 });
}
