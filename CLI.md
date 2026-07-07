# `atlas` CLI

Reference CLI for ATLAS `.atsx` containers (see [README.md](README.md) for
the format itself). Installs as the `atlas` command (`pip install -e .`
inside this repo), or run without installing via `python -m atlas_parser`.

Implemented with [click](https://click.palletsprojects.com/) on top of the
existing `atlas_parser` core (`parser.py`, `schemas.py`, `graph.py`) - the
CLI does no parsing or validation of its own beyond the cross-reference
checks described under `atlas validate` below.

## `atlas pack <folder> [-o output.atsx]`

Zips a project folder laid out per [README §2](README.md#2-file-anatomy)
(`manifest.atsx.yaml`, optional `state.atsx.yaml`, optional `resources/`,
optional `attachments/`) into a single `.atsx` file.

- Validates `manifest.atsx.yaml` (and `state.atsx.yaml`, if present)
  against the JSON Schema **before** packing. Refuses to pack and exits
  `1` if either is invalid.
- Default output: `<meta.id>.atsx` in the current directory.
- `manifest.atsx.yaml` / `state.atsx.yaml` are stored uncompressed
  (`ZIP_STORED`); everything under `resources/` and `attachments/` is
  compressed (`ZIP_DEFLATED`), per [README §2](README.md#2-file-anatomy).
- Overwrites the output file if it already exists.

```
atlas pack my-build/
atlas pack my-build/ -o dist/my-build-v2.atsx
```

## `atlas unpack <file.atsx> [-o output_folder] [--force]`

Reverse of `pack` - extracts a `.atsx` container into a folder.

- Default output folder: the `.atsx` filename without its extension, in
  the current directory.
- Refuses to extract into an existing **non-empty** folder unless
  `--force` is passed. `--force` extracts on top of the existing folder
  (matching filenames are overwritten; other files are left alone).

```
atlas unpack my-build.atsx
atlas unpack my-build.atsx -o ./workdir --force
```

## `atlas validate <file.atsx | folder>`

Accepts either a packed `.atsx` file or a raw unpacked project folder
(detected automatically). Runs the manifest/state through the existing
JSON Schema validator, then additionally checks what the schema alone
can't express:

- Every `process[].depends_on` and `process[].requires_resources` id
  resolves to a real step/resource id.
- No cycles in the step DAG (plain DFS/Kahn's-algorithm check in
  `atlas_parser/graph.py` - no new dependency added for this).
- Every `resources[].bundle` path actually exists in the archive/folder.
- Every `resources[].part_of` resolves to a real `subassembly`-type
  resource.
- Every `branches[].options[].chosen_step` id resolves to a real step.
- If a `state.atsx.yaml` is present: every `progress` key and every
  `branch_choices` key/value resolves to a real step id / branch id /
  option value.

Prints every issue found, not just the first. Exit code `0` if valid, `1`
otherwise - safe to use in CI/scripts.

```
atlas validate my-build.atsx
atlas validate my-build/
```

## `atlas status <file.atsx | folder>`

Prints the process tree in dependency (topological) order, respecting
`group`/nested `steps`, with each step's progress from `state.atsx.yaml`
(absent state = everything `todo`, per [README §6.2](README.md#62-reader-behavior)):

| Marker | Status |
|---|---|
| `[x]` | done |
| `[ ]` | todo |
| `[~]` | in_progress |
| `[!]` | blocked |
| `[-]` | skipped |

- Warns (non-fatally) if `state.spec_version` differs from
  `manifest.meta.version` ([README §6.3](README.md#63-drift-detection)).
- If a `branches` choice has been made in `state.branch_choices`, only
  that option's `chosen_step`s (plus any step never gated by a branch)
  are shown. If no choice has been made yet, all steps are shown and the
  available options are printed as a note.

```
atlas status my-build.atsx
atlas status my-build/
```

## Exit codes

| Command | 0 | 1 |
|---|---|---|
| `pack` | packed | manifest/state invalid |
| `unpack` | unpacked | target exists non-empty (no `--force`), or not a valid zip |
| `validate` | no issues found | schema or cross-reference issues found |
| `status` | printed | file/folder not found or unparseable |
