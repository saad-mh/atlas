# Running ATLAS

How to install and run every component in this repo.

## CLI (`atlas_parser`)

Reference implementation of the parser/validator/CLI.

Prerequisites: Python >= 3.10.

Install (editable, from repo root):

```bash
pip install -e .
```

This installs the `atlas` command on `PATH` (entry point defined in
[pyproject.toml](pyproject.toml)). Alternatively, run without installing:

```bash
python -m atlas_parser <command> ...
```

Run:

```bash
atlas pack my-build/
atlas unpack my-build.atsx
atlas validate my-build.atsx
atlas status my-build.atsx
```

Run tests ([tests/](tests/), pytest):

```bash
pip install -e ".[dev]"
pytest
```

## Reader (desktop app)

Tauri + React desktop app that opens a `.atsx` file and renders its
Resources/Process/State views. Lives in [`reader/`](reader/).

Prerequisites:
- `atlas` on `PATH` - install the CLI first (see above); the reader shells
  out to it and does no parsing of its own.
- Node.js + npm
- Rust (`rustc`/`cargo` - e.g. `brew install rust`, or via
  [rustup](https://rustup.rs))

Install:

```bash
cd reader
npm install
```

Run (dev mode, hot reload, opens a native window):

```bash
cd reader
npm run tauri dev
```

There is no packaging/installer step yet - `npm run tauri dev` is the
supported way to run the reader in this pass.
