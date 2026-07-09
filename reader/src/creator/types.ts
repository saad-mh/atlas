// Draft-mode shapes for the creator wizard. Deliberately distinct from
// ../types.ts (the read-only AtsxStatus shapes returned by `atlas status`):
// a manifest under construction is allowed to be incomplete/invalid, which
// AtsxStatus's fields (e.g. non-nullable `verify`, resolved `visible`) don't
// model. Only at export time does a draft get serialized into a real
// manifest.atsx.yaml (see manifestYaml.ts) and handed to `atlas pack`.

export type ResourceKind = "hardware" | "software" | "other";
export type StepKind = "task" | "group" | "checkpoint";
export type VerifyType = "manual" | "file_exists" | "checksum";

export interface DraftMeta {
  title: string;
  id: string;
  idManual: boolean;
  kind: "software" | "hardware" | "hybrid" | "process";
  version: string;
  authors: string[];
  license: string;
  description: string;
}

export interface DraftSubstitute {
  key: string;
  name: string;
  note: string;
}

export interface DraftResource {
  key: string;
  id: string;
  idManual: boolean;
  type: ResourceKind;
  name: string;
  quantity: string; // kept as text while editing; parsed to number at export time
  unit: string;
  required: boolean;
  source: string;
  substitutes: DraftSubstitute[];
}

export interface DraftVerify {
  type: VerifyType;
  path: string; // used by file_exists and checksum
  hash: string; // used by checksum only
}

export interface DraftStep {
  key: string;
  id: string;
  idManual: boolean;
  title: string;
  dependsOn: string[]; // step `key`s (not slugs - stable across id edits)
  requiresResources: string[]; // resource `key`s
  instructions: string;
  kind: StepKind;
  verify: DraftVerify;
  steps: DraftStep[]; // nested steps, meaningful when kind === "group"
}

export interface DraftBranchOption {
  key: string;
  value: string;
  activatesSteps: string[]; // step `key`s
}

export interface DraftBranch {
  key: string;
  id: string;
  idManual: boolean;
  question: string;
  options: DraftBranchOption[];
}

export interface CreatorDraft {
  meta: DraftMeta;
  resources: DraftResource[];
  steps: DraftStep[];
  branches: DraftBranch[];
}

export function newKey(): string {
  return crypto.randomUUID();
}

export function emptyMeta(): DraftMeta {
  return {
    title: "",
    id: "",
    idManual: false,
    kind: "software",
    version: "1.0.0",
    authors: [""],
    license: "",
    description: "",
  };
}

export function emptyResource(): DraftResource {
  return {
    key: newKey(),
    id: "",
    idManual: false,
    type: "software",
    name: "",
    quantity: "",
    unit: "",
    required: true,
    source: "",
    substitutes: [],
  };
}

export function emptySubstitute(): DraftSubstitute {
  return { key: newKey(), name: "", note: "" };
}

export function emptyStep(): DraftStep {
  return {
    key: newKey(),
    id: "",
    idManual: false,
    title: "",
    dependsOn: [],
    requiresResources: [],
    instructions: "",
    kind: "task",
    verify: { type: "manual", path: "", hash: "" },
    steps: [],
  };
}

export function emptyBranchOption(): DraftBranchOption {
  return { key: newKey(), value: "", activatesSteps: [] };
}

export function emptyBranch(): DraftBranch {
  return { key: newKey(), id: "", idManual: false, question: "", options: [] };
}

export function emptyDraft(): CreatorDraft {
  return { meta: emptyMeta(), resources: [], steps: [], branches: [] };
}

/** Pre-order flatten, mirroring atlas_parser/graph.py's flatten_steps - both
 * the depends_on "must reference an earlier step" rule and export
 * serialization rely on this same order. */
export function flattenSteps(steps: DraftStep[]): DraftStep[] {
  const flat: DraftStep[] = [];
  const walk = (list: DraftStep[]) => {
    for (const s of list) {
      flat.push(s);
      walk(s.steps);
    }
  };
  walk(steps);
  return flat;
}

/** All descendant keys of a step (not including itself). */
export function descendantKeys(step: DraftStep): Set<string> {
  const out = new Set<string>();
  const walk = (list: DraftStep[]) => {
    for (const s of list) {
      out.add(s.key);
      walk(s.steps);
    }
  };
  walk(step.steps);
  return out;
}
