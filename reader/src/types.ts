// Mirrors the JSON shape emitted by `atlas status --json` (atlas_parser/cli.py).
// Every object has a fixed key set with explicit nulls for absent optional
// fields - keep this in sync with `_meta_json` / `_resource_json` /
// `_step_json` / `_branches_json` in atlas_parser/cli.py if that shape ever
// changes.

export type StepStatus = "todo" | "in_progress" | "done" | "blocked" | "skipped";
export type StepKind = "task" | "group" | "checkpoint";
export type ResourceType = "hardware" | "software" | "subassembly" | "other";

export interface Meta {
  id: string;
  title: string;
  kind: string;
  version: string;
  authors: string[];
  license: string | null;
  description: string | null;
  created: string | null;
  updated: string | null;
}

export interface Substitute {
  name: string;
  note?: string;
}

export interface Resource {
  id: string;
  type: ResourceType;
  name: string;
  quantity: number | null;
  unit: string | null;
  bundle: string | null;
  source: string | null;
  required: boolean;
  substitutes: Substitute[];
  part_of: string | null;
  kind: string | null;
  spec_ref: string | null;
}

export interface Verify {
  type: "manual" | "file_exists" | "checksum" | "command";
  [key: string]: unknown;
}

export interface Step {
  id: string;
  title: string;
  kind: StepKind;
  depends_on: string[];
  requires_resources: string[];
  instructions: string | null;
  attachments: string[];
  verify: Verify;
  status: StepStatus;
  completed_at: string | null;
  notes: string | null;
  visible: boolean;
  steps: Step[];
}

export interface BranchOption {
  value: string;
  chosen_step: string[];
}

export interface Branch {
  id: string;
  question: string;
  options: BranchOption[];
  chosen: string | null;
}

export interface StateInstances {
  count: number;
  names: string[];
  using: string | null;
}

export interface ProgressSummary {
  total: number;
  done: number;
  percent: number;
}

export interface AtsxStatus {
  path: string;
  meta: Meta;
  warnings: string[];
  state_instances: StateInstances;
  resources: Resource[];
  steps: Step[];
  branches: Branch[];
  progress_summary: ProgressSummary;
}
