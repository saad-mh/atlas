# ATLAS

ATtas Specification: a single file container format for handing someone everything they need to build the same thing you built: a physical product, a piece of software, or any multi-step process with dependencies.

One file in, one file out. Give someone a `.atsx`, they open it in the ATLAS reader, or perhaps anything that can open this file - they see what they need, what order to do it in, and check things off as they go.

> Status: pre-v1, draft specification. Everything here is subject to change until `1.0` is tagged. Breaking changes bump `atlas_version`.

---

## 1. Design goals (in priority order)

1. **Single-file portability.** One `.atsx` file is a complete handoff. No "also grab environment.yml and the BOM spreadsheet and the photos folder." Everything required to build the thing travels together.
2. **Human-readable core.** The actual instructions and dependency list are plain text (YAML) that a person can read without opening the reader app. No proprietary binary blob at the center.
3. **Cheap to parse.** Built on existing, boring, well-supported syntax (YAML + zip). No new grammar, no custom parser to write and maintain.
4. **Layered, not flat.** Resources, process, and progress are distinct concerns that render as distinct views in a reader, not one big list.
5. **Variability.** Real builds branch - different fabrication methods, optional steps, substitutable parts. The format should represent choices, not just one fixed path.
6. **Scales down and up.** A three-step recipe and a 200-step robotics build should both be valid, and the simple case shouldn't require boilerplate.

---

## 2. File anatomy

An `.atsx` file is a **zip archive** with a fixed internal layout, using the `.atsx` extension instead of `.zip`. This is the same trick `.docx`, `.epub`, and `.jar` use: one file for the user to double-click, share, or upload, but an inspectable, structured directory underneath.

```bash
project.atsx  (zip container)
│
├── manifest.atsx.yaml      # REQUIRED. The spec itself: meta + resources + process + branches
├── state.atsx.yaml         # OPTIONAL. Progress tracking (see §6). Absent = fresh, unstarted copy.
│
├── resources/              # OPTIONAL. Bundled/snapshotted dependency files.
│   ├── environment.yml     #   e.g. a real conda env file, embedded verbatim
│   ├── package.json        #   e.g. a real npm manifest, embedded verbatim
│   └── bom.csv             #   e.g. a full hardware BOM export
│
└── attachments/            # OPTIONAL. Photos, diagrams, reference docs, datasheets.
    ├── controller-wiring.png
    └── datasheet-rplidar.pdf
```

**Why zip-a-file-with-a-different-extension instead of one giant YAML file:**
- Binary attachments (photos, datasheets, model weights pointers) don't belong inline in a text file - they'd wreck readability and diffability.
- Bundling a *real* `environment.yml` or `package.json` verbatim under `resources/` means you're not reinventing dependency-file syntax or hand-copying package lists into YAML where they'll drift out of sync.
  `manifest.atsx.yaml` references them by relative path, and they physically travel inside the same `.atsx` file - no external dependency, no duplication.
- Anyone can `unzip project.atsx -d project/` and read/edit everything with zero special tooling. The format degrades gracefully to "a folder" if the reader app doesn't exist or isn't trusted.

**Compression:** store `manifest.atsx.yaml` and `state.atsx.yaml` uncompressed or with minimal compression (STORED or fast DEFLATE) so tools can peek at them without full decompression. Attachments can compress normally.

---

## 3. `manifest.atsx.yaml` : top-level shape

```yaml
atlas_version: "0.1"

meta:
  id: "build-an-octopus-farm"       # slug; stable identifier across versions
  title: "How to have unlimited octopuses"
  kind: process                     # software | hardware | hybrid | process
  version: "2.3.4"                  # this build's own version, semver-ish
  authors: ["calcium", "phosphor"]
  license: "MIT"
  description: >
    "how are we supposed to build an octopus farm now?"
  created: 2026-07-07
  updated: 2026-07-07

resources: [ ... ]                  # see §4
process: [ ... ]                    # see §5
branches: [ ... ]                   # see §5.3
```

`meta.id` + `meta.version` together are the identity of a build - the state sidecar checks these to detect drift (§6.3).

---

## 4. Resource layer

A resource is anything required before or during the build: a physical part, a software dependency, a tool, a skill, a bundled file, or a nested sub-assembly.

```yaml
resources:
  - id: python-env
    type: software
    name: "Python 3.10 conda env"
    kind: environment
    bundle: "resources/environment.yml"   # relative path inside the .atsx
    required: true

  - id: qwen-vlm
    type: software
    name: "Qwen2.5-VL-3B-Instruct"
    kind: model_weights
    source: "huggingface:Qwen/Qwen2.5-VL-3B-Instruct"
    required: true
    substitutes: []

  - id: m3-screws
    type: hardware
    name: "M3x10 socket head screws"
    quantity: 8
    unit: pcs
    source: "any hardware store"
    required: true
    substitutes:
      - name: "M3x12 socket head screws"
        note: "fine if standoff has clearance"

  - id: drive-subassembly
    type: subassembly
    name: "Omnidirectional drive base"
    spec_ref: "nested"               # see §4.3 - this resource is itself an .atsx-shaped tree

  - id: motor
    type: hardware
    name: "Mecanum wheel motor"
    quantity: 4
    unit: pcs
    part_of: drive-subassembly
```

### 4.1 Common fields
| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique within the file. Referenced by `process[].requires_resources`. |
| `type` | yes | `hardware` \| `software` \| `subassembly` \| `other` |
| `name` | yes | Human label. |
| `quantity` / `unit` | for `hardware` | Omit for software/abstract resources. |
| `bundle` | optional | Relative path into `resources/` - a real file traveling inside the `.atsx`. |
| `source` | optional | Where to get it if not bundled (URL, store name, package registry). |
| `required` | optional, default `true` | `false` = optional/nice-to-have. |
| `substitutes` | optional | Ranked fallback list, each with a `note`. Empty/absent = no substitutes. |
| `part_of` | optional | `id` of a `subassembly`-type resource this belongs to. See §4.3. |

### 4.2 Why `bundle` instead of always `source`
If you have a real `environment.yml`, a `package-lock.json`, or a BOM CSV export, drop it under `resources/` in the zip and point `bundle` at it. The reader app can hand that file straight to pip/npm/conda/whatever. That way you're not re-encoding dependency data into a new schema, and the receiver isn't stuck fetching a second file from somewhere else. `source` is for things that genuinely can't be, or shouldn't be bundled (large model weights, a physical part from a supplier).

### 4.3 Sub-assemblies (Multi-level BOM)

The `resources:` section is always a flat list. Instead of nesting resources inside one another, a resource can belong to a sub-assembly by setting: part_of: `subassembly_id`

A resource with `type: subassembly` acts as a container that other resources can reference. This approach keeps the file format simple while still supporting multi-level BoMs. A sub-assembly can itself belong to another sub-assembly by using `part_of`. Applications can rebuild the hierarchy by following the `part_of` references, presenting it as a collapsible tree if desired, while the underlying file remains a single flat list that is easier to parse, edit, and compare in version control.

---

## 5. Process layer

Steps form a **DAG**, not a flat checklist - a step can depend on multiple
prior steps, and independent steps can be shown as safely parallel/reorderable
by the reader app.

```yaml
process:
  - id: setup-env
    title: "Set up conda environment"
    depends_on: []
    requires_resources: [python-env]
    kind: task
    instructions: >
      Create an isolated conda env per tool. Do not share environments
      between SAM2, labelme, and VLM inference - dependency conflicts
      are frequent.
    verify:
      type: manual

  - id: download-vlm
    title: "Download VLM weights"
    depends_on: [setup-env]
    requires_resources: [qwen-vlm]
    kind: task
    instructions: "Download and cache model weights locally."
    verify:
      type: file_exists
      path: "weights/qwen"

  - id: build-controller
    title: "Implement go-to-goal controller"
    depends_on: [download-vlm]
    kind: group
    steps:
      - id: controller-math
        title: "Derive proportional control law"
        depends_on: []
      - id: controller-code
        title: "Implement controller in Python"
        depends_on: [controller-math]
```

### 5.1 Common fields
| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique within its scope. |
| `title` | yes | Short label. |
| `depends_on` | yes (may be empty) | List of step `id`s that must be `done` first. |
| `requires_resources` | optional | List of resource `id`s this step consumes. |
| `kind` | optional, default `task` | `task` \| `group` (has nested `steps`) \| `checkpoint` |
| `instructions` | optional | Free text / markdown. The actual how-to. |
| `attachments` | optional | List of relative paths into `attachments/`. |
| `verify` | optional | See §5.2. |

### 5.2 Verification
| `type` | Meaning |
|---|---|
| `manual` | User self-marks done. Default if `verify` omitted. |
| `file_exists` | Reader checks a path exists (relative to build working dir, not inside the `.atsx`). |
| `checksum` | Reader checks a file hash matches. |
| `command` | Reader runs a shell command, checks exit code. |

`command` verification is deferred to sandboxing design (open question, §7) - until that's resolved, reader apps should treat `command` verify steps as opt-in and require explicit user confirmation before running.

### 5.3 Branches (variability)
Real builds fork on real-world choices - fabrication method, platform, available tools. Branches let one `.atsx` represent several valid paths instead of forcing one canonical build.

```yaml
branches:
  - id: fabrication-method
    question: "How will you fabricate the mount?"
    options:
      - value: "3d-print"
        chosen_step: [print-mount]
      - value: "laser-cut"
        chosen_step: [cut-mount]
```

Reader apps prompt the user once per branch (or read a prior choice from `state.atsx.yaml`) and show only the activated steps. Steps not gated by any branch are always active.

---

## 6. State layer - `state.atsx.yaml`

Progress is deliberately **separate from the spec**, so the manifest stays a clean, reusable, shareable artifact and doesn't accumulate one person's build history. It lives alongside the manifest inside the same `.atsx` zip, so the file is still single-file-portable - it's just a distinct internal document.

```yaml
atlas_state_version: "0.1"
spec_id: "mars-rover-nav-pipeline"
spec_version: "1.2.0"
instance_id: "name-local-2026-07"

progress:
  setup-env:
    status: done # todo | in_progress | done | blocked | skipped
    completed_at: "2026-07-01T10:00:00Z"
    notes: "Used hammering instead of screwing, faster."
  download-vlm:
    status: in_progress
  build-controller:
    status: todo

branch_choices:
  fabrication-method: "3d-print"
```

### 6.1 Multiple builders, one file
If several people build from the same `.atsx`, the reader app can maintain multiple `state.atsx.yaml`-equivalents (e.g. `state.<instance_id>.atsx.yaml`) inside the same archive, or the receiver can strip `state.atsx.yaml` entirely when re-sharing a clean copy of the spec for someone else to start fresh.

### 6.2 Reader behavior
- No `state.atsx.yaml` present → render as a fresh, 0%-progress build.
- Present → render progress, gray out/hide branch paths not chosen, warn if `spec_version` in state doesn't match `meta.version` in the manifest (spec changed since this build started).

### 6.3 Drift detection
`state.spec_version` vs `manifest.meta.version` mismatch means the spec was updated after the builder started. Readers should surface this as a non-blocking warning, not silently ignore it - the builder may be mid-way through a now-outdated step.

---

## 7. Open questions

1. **`command` verify sandboxing.** Running arbitrary shell commands from a file someone downloaded is a real risk surface. Needs a trust/confirmation model before this ships as anything but opt-in-and-warned.
2. **Bundle size limits.** Model weights and large datasets shouldn't be naively zipped inline - likely need a `source`-with-hash pattern for anything above some size threshold, bundling only small/critical files.
3. **Canonical pattern for `subassembly` resources that are themselves shareable `.atsx` files** - reuse a whole other person's build as a component of yours, rather than copy-pasting their resource tree in.
4. **Conflict resolution** when `resources/` bundles a file whose `source` also point elsewhere (e.g. bundled `environment.yml` is stale vs. a newer version at `source`). Bundled should probably always win - it's what was actually tested against.

---

## 8. Non-goals

- ATLAS is not a package manager, build system, or CI tool. It orchestrates and documents; it doesn't replace `pip`, `npm`, `make`, or a CAD tool.
- ATLAS is not trying to be a new dependency-file syntax. Bundled resource files use their native, existing formats verbatim.
- v1 is not attempting real-time multi-user collaborative editing of a `.atsx` - that's a distinct, harder problem (see potential v2 direction).

---

## 9. Roadmap sketch

- [ ] `0.1` - this spec, frozen enough to build against.
- [ ] JSON Schema for `manifest.atsx.yaml` and `state.atsx.yaml` (validation).
- [ ] Reference CLI: `atlas validate`, `atlas status`, `atlas pack` (folder → `.atsx`), `atlas unpack`.
- [ ] Reader app: renders resources / process / state as distinct views, handles branch prompts, tracks progress.
- [ ] `1.0` once schema + CLI + one real project (yours) have round-tripped cleanly.