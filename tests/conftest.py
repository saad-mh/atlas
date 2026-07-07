from __future__ import annotations

import zipfile
from pathlib import Path

import pytest

VALID_MANIFEST = """\
atlas_version: "0.1"

meta:
  id: mars-rover-nav-pipeline
  title: "Mars Rover Nav Pipeline"
  kind: software
  version: "1.2.0"
  authors: ["ada"]
  license: MIT
  description: "Test build."
  created: 2026-07-01
  updated: 2026-07-01

resources:
  - id: python-env
    type: software
    name: "Python 3.10 conda env"
    kind: environment
    bundle: "resources/environment.yml"
    required: true
  - id: qwen-vlm
    type: software
    name: "Qwen2.5-VL-3B-Instruct"
    kind: model_weights
    source: "huggingface:Qwen/Qwen2.5-VL-3B-Instruct"
    required: true

process:
  - id: setup-env
    title: "Set up conda environment"
    depends_on: []
    requires_resources: [python-env]
    kind: task
    instructions: "Create an isolated conda env."
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
"""

VALID_STATE = """\
atlas_state_version: "0.1"
spec_id: mars-rover-nav-pipeline
spec_version: "1.2.0"
instance_id: "test-instance"

progress:
  setup-env:
    status: done
    completed_at: "2026-07-01T10:00:00Z"
  download-vlm:
    status: in_progress

branch_choices: {}
"""

DRIFTED_STATE = VALID_STATE.replace('spec_version: "1.2.0"', 'spec_version: "1.0.0"')

INVALID_MANIFEST_MISSING_KIND = """\
atlas_version: "0.1"
meta:
  id: broken-build
  title: "Broken"
  version: "1.0.0"
resources: []
process: []
"""

MALFORMED_YAML = "meta:\n  id: [unterminated\n"


def make_atsx(path: Path, files: dict[str, str | bytes]) -> Path:
    with zipfile.ZipFile(path, "w") as zf:
        for name, content in files.items():
            data = content.encode("utf-8") if isinstance(content, str) else content
            zf.writestr(name, data)
    return path


@pytest.fixture
def valid_atsx(tmp_path: Path) -> Path:
    return make_atsx(
        tmp_path / "build.atsx",
        {
            "manifest.atsx.yaml": VALID_MANIFEST,
            "state.atsx.yaml": VALID_STATE,
            "resources/environment.yml": "name: rover-env\ndependencies: [python=3.10]\n",
            "attachments/notes.txt": "wiring notes",
        },
    )
