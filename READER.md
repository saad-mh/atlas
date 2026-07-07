# ATLAS reader (desktop app)

A Tauri + React desktop app that opens a `.atsx` file and renders it as
three distinct views, per [README §1 goal 4](README.md#1-design-goals-in-priority-order):
**Resources**, **Process**, and **State**. Lives in [`reader/`](reader/).

## Architecture

Tauri's Rust core does no `.atsx` parsing, validation, or DAG logic of its
own - it shells out to the existing `atlas` CLI (see [CLI.md](CLI.md)) and
passes its JSON straight through to the React frontend. There is no
standalone server; this is a local desktop app opening a local file, and
Tauri's own IPC between the Rust core and the webview is all that's needed.

```
React frontend  <--invoke-->  Rust (src-tauri)  <--subprocess-->  atlas CLI  <--parses-->  .atsx file
```

Two Tauri commands, both in [`reader/src-tauri/src/lib.rs`](reader/src-tauri/src/lib.rs):

- `load_atsx(path)` - runs `atlas status --json <path>`, returns the parsed
  JSON (see the shape in [`reader/src/types.ts`](reader/src/types.ts)) or
  the CLI's stderr message as an error.
- `mark_step(path, step_id, status)` - runs
  `atlas mark <path> <step_id> <status>`, then re-runs `load_atsx` and
  returns the fresh status. The frontend never mutates its own state
  optimistically; the CLI/state file stays the single source of truth,
  same as everywhere else in this project.

All `.atsx` mutation logic (the `mark` write path, per README §6) lives in
Python alongside the parser/schema/DAG code, not in Rust - see
`atlas_parser/cli.py`'s `mark` command and `atlas_parser/parser.py`'s
`write_state_to_atsx`.

Navigation between the three views is a tab bar rather than a sidebar -
for a 3-view app a tab bar is a flat row of buttons with no extra layout
shell, whereas a sidebar needs its own two-column app-shell/collapse
handling for the same result.

## Running in dev mode

Prerequisites:
- `atlas` on `PATH` (`pip install -e .` from the repo root - see
  [CLI.md](CLI.md))
- Node.js + npm
- Rust (`rustc`/`cargo` - e.g. `brew install rust`, or via
  [rustup](https://rustup.rs))

```bash
cd reader
npm install
npm run tauri dev
```

This starts the Vite dev server and opens the app in a native window with
hot reload on the frontend. There is no packaging/installer step in this
pass - `npm run tauri dev` is the supported way to run it.

## Non-goals (this pass)

Same restrictions as the CLI and format spec:
- No editing `manifest.atsx.yaml` (adding/removing resources or steps) -
  this is a reader/progress-tracker, not an authoring tool.
- No execution of `verify.type: command` steps - these are only ever
  displayed, never run (README §7.1).
- No multi-instance state UI (README §6.1) - if a `.atsx` has more than
  one `state.<instance_id>.atsx.yaml`, the State view shows a notice and
  reads only the default/sole instance.
- Selecting an unresolved branch's option in the Process view only
  previews (greys out the other path) client-side; it is not written to
  `state.atsx.yaml` in this pass.
