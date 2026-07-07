from __future__ import annotations

import json
import zipfile
from pathlib import Path

import pytest
import yaml
from click.testing import CliRunner

from atlas_parser.cli import cli

MANIFEST_WITH_BRANCH = """\
atlas_version: "0.1"

meta:
  id: widget-mount
  title: "Widget Mount"
  kind: hardware
  version: "1.0.0"
  authors: ["ada"]
  license: MIT
  description: "Test build with a branch and a nested group."
  created: 2026-07-01
  updated: 2026-07-01

resources:
  - id: cad-file
    type: software
    name: "Mount CAD file"
    bundle: "resources/mount.svg"
    required: true
  - id: screws
    type: hardware
    name: "M3 screws"
    quantity: 4
    unit: pcs
    source: "hardware store"
    required: true

process:
  - id: prep
    title: "Prep workspace"
    depends_on: []
  - id: print-mount
    title: "3D print the mount"
    depends_on: [prep]
    requires_resources: [cad-file]
  - id: cut-mount
    title: "Laser-cut the mount"
    depends_on: [prep]
    requires_resources: [cad-file]
  - id: assemble
    title: "Assemble"
    depends_on: [prep]
    kind: group
    steps:
      - id: attach
        title: "Attach mount"
        depends_on: []
      - id: route
        title: "Route cables"
        depends_on: [attach]

branches:
  - id: fabrication-method
    question: "How will you fabricate the mount?"
    options:
      - value: "3d-print"
        chosen_step: [print-mount]
      - value: "laser-cut"
        chosen_step: [cut-mount]
"""

STATE_IN_PROGRESS = """\
atlas_state_version: "0.1"
spec_id: widget-mount
spec_version: "1.0.0"
instance_id: "test-instance"

progress:
  prep:
    status: done
  print-mount:
    status: in_progress

branch_choices:
  fabrication-method: "3d-print"
"""

MANIFEST_MISSING_KIND = """\
atlas_version: "0.1"
meta:
  id: broken-build
  title: "Broken"
  version: "1.0.0"
resources: []
process: []
"""


def make_project(tmp_path: Path, name: str, manifest: str, state: str | None = None) -> Path:
    folder = tmp_path / name
    (folder / "resources").mkdir(parents=True)
    (folder / "manifest.atsx.yaml").write_text(manifest)
    (folder / "resources" / "mount.svg").write_text("<svg/>")
    if state is not None:
        (folder / "state.atsx.yaml").write_text(state)
    return folder


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


def test_pack_then_validate_roundtrip(tmp_path: Path, runner: CliRunner):
    folder = make_project(tmp_path, "proj", MANIFEST_WITH_BRANCH)
    output = tmp_path / "out.atsx"

    result = runner.invoke(cli, ["pack", str(folder), "-o", str(output)])
    assert result.exit_code == 0, result.output
    assert output.is_file()

    with zipfile.ZipFile(output) as zf:
        names = set(zf.namelist())
    assert "manifest.atsx.yaml" in names
    assert "resources/mount.svg" in names
    assert zf.getinfo("manifest.atsx.yaml").compress_type == zipfile.ZIP_STORED

    result = runner.invoke(cli, ["validate", str(output)])
    assert result.exit_code == 0, result.output
    assert "OK:" in result.output


def test_pack_default_output_name_uses_meta_id(tmp_path: Path, runner: CliRunner):
    folder = make_project(tmp_path, "proj", MANIFEST_WITH_BRANCH)
    with runner.isolated_filesystem(temp_dir=tmp_path):
        result = runner.invoke(cli, ["pack", str(folder)])
        assert result.exit_code == 0, result.output
        assert Path("widget-mount.atsx").is_file()


def test_pack_refuses_invalid_manifest(tmp_path: Path, runner: CliRunner):
    folder = make_project(tmp_path, "proj", MANIFEST_MISSING_KIND)
    output = tmp_path / "out.atsx"

    result = runner.invoke(cli, ["pack", str(folder), "-o", str(output)])

    assert result.exit_code == 1
    assert "kind" in result.output
    assert not output.exists()


def test_unpack_roundtrip(tmp_path: Path, runner: CliRunner):
    folder = make_project(tmp_path, "proj", MANIFEST_WITH_BRANCH)
    packed = tmp_path / "out.atsx"
    runner.invoke(cli, ["pack", str(folder), "-o", str(packed)])

    unpacked = tmp_path / "unpacked"
    result = runner.invoke(cli, ["unpack", str(packed), "-o", str(unpacked)])

    assert result.exit_code == 0, result.output
    assert (unpacked / "manifest.atsx.yaml").is_file()
    assert (unpacked / "resources" / "mount.svg").is_file()


def test_unpack_refuses_nonempty_without_force(tmp_path: Path, runner: CliRunner):
    folder = make_project(tmp_path, "proj", MANIFEST_WITH_BRANCH)
    packed = tmp_path / "out.atsx"
    runner.invoke(cli, ["pack", str(folder), "-o", str(packed)])

    unpacked = tmp_path / "unpacked"
    unpacked.mkdir()
    (unpacked / "existing.txt").write_text("keep me")

    result = runner.invoke(cli, ["unpack", str(packed), "-o", str(unpacked)])
    assert result.exit_code == 1
    assert "already exists" in result.output
    assert (unpacked / "existing.txt").is_file()

    result = runner.invoke(cli, ["unpack", str(packed), "-o", str(unpacked), "--force"])
    assert result.exit_code == 0, result.output
    assert (unpacked / "manifest.atsx.yaml").is_file()


def test_validate_detects_cycle(tmp_path: Path, runner: CliRunner):
    manifest = MANIFEST_WITH_BRANCH.replace(
        '  - id: prep\n    title: "Prep workspace"\n    depends_on: []\n',
        '  - id: prep\n    title: "Prep workspace"\n    depends_on: [assemble]\n',
    )
    folder = make_project(tmp_path, "proj", manifest)

    result = runner.invoke(cli, ["validate", str(folder)])

    assert result.exit_code == 1
    assert "cycle detected" in result.output


def test_validate_detects_dangling_references(tmp_path: Path, runner: CliRunner):
    manifest = MANIFEST_WITH_BRANCH.replace(
        "depends_on: [prep]\n    requires_resources: [cad-file]\n  - id: cut-mount",
        "depends_on: [prep, no-such-step]\n    requires_resources: [cad-file, no-such-resource]\n  - id: cut-mount",
    )
    folder = make_project(tmp_path, "proj", manifest)

    result = runner.invoke(cli, ["validate", str(folder)])

    assert result.exit_code == 1
    assert "no-such-step' does not resolve to a real step id" in result.output
    assert "no-such-resource' does not resolve to a real resource id" in result.output


def test_validate_detects_missing_bundle(tmp_path: Path, runner: CliRunner):
    folder = make_project(tmp_path, "proj", MANIFEST_WITH_BRANCH)
    (folder / "resources" / "mount.svg").unlink()

    result = runner.invoke(cli, ["validate", str(folder)])

    assert result.exit_code == 1
    assert "does not exist in the archive/folder" in result.output


def test_validate_accepts_packed_and_folder_equally(tmp_path: Path, runner: CliRunner):
    folder = make_project(tmp_path, "proj", MANIFEST_WITH_BRANCH)
    packed = tmp_path / "out.atsx"
    runner.invoke(cli, ["pack", str(folder), "-o", str(packed)])

    folder_result = runner.invoke(cli, ["validate", str(folder)])
    packed_result = runner.invoke(cli, ["validate", str(packed)])

    assert folder_result.exit_code == 0
    assert packed_result.exit_code == 0


def test_status_fresh_project_all_todo_with_branch_note(tmp_path: Path, runner: CliRunner):
    folder = make_project(tmp_path, "proj", MANIFEST_WITH_BRANCH)

    result = runner.invoke(cli, ["status", str(folder)])

    assert result.exit_code == 0, result.output
    assert "[ ] prep" in result.output
    assert "[ ] print-mount" in result.output
    assert "[ ] cut-mount" in result.output
    assert "attach" in result.output and "route" in result.output
    assert "Branches awaiting a choice" in result.output


def test_status_with_progress_and_branch_choice(tmp_path: Path, runner: CliRunner):
    folder = make_project(tmp_path, "proj", MANIFEST_WITH_BRANCH, state=STATE_IN_PROGRESS)

    result = runner.invoke(cli, ["status", str(folder)])

    assert result.exit_code == 0, result.output
    assert "[x] prep" in result.output
    assert "[~] print-mount" in result.output
    assert "cut-mount" not in result.output  # hidden: laser-cut option not chosen
    assert "Branches awaiting a choice" not in result.output


def test_status_drift_warning(tmp_path: Path, runner: CliRunner):
    drifted_state = STATE_IN_PROGRESS.replace('spec_version: "1.0.0"', 'spec_version: "0.9.0"')
    folder = make_project(tmp_path, "proj", MANIFEST_WITH_BRANCH, state=drifted_state)

    result = runner.invoke(cli, ["status", str(folder)])

    assert result.exit_code == 0
    assert "WARNING" in result.output
    assert "0.9.0" in result.output


def find_step(steps: list[dict], step_id: str) -> dict | None:
    for step in steps:
        if step["id"] == step_id:
            return step
        found = find_step(step["steps"], step_id)
        if found is not None:
            return found
    return None


def test_validate_json_ok(tmp_path: Path, runner: CliRunner):
    folder = make_project(tmp_path, "proj", MANIFEST_WITH_BRANCH)

    result = runner.invoke(cli, ["validate", str(folder), "--json"])

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data == {
        "valid": True,
        "path": str(folder),
        "build": {"id": "widget-mount", "version": "1.0.0"},
        "counts": {"resources": 2, "process_steps": 6},
        "issues": [],
    }


def test_validate_json_reports_semantic_issues(tmp_path: Path, runner: CliRunner):
    manifest = MANIFEST_WITH_BRANCH.replace(
        "depends_on: [prep]\n    requires_resources: [cad-file]\n  - id: cut-mount",
        "depends_on: [prep, no-such-step]\n    requires_resources: [cad-file]\n  - id: cut-mount",
    )
    folder = make_project(tmp_path, "proj", manifest)

    result = runner.invoke(cli, ["validate", str(folder), "--json"])

    assert result.exit_code == 1
    data = json.loads(result.output)
    assert data["valid"] is False
    assert data["build"] == {"id": "widget-mount", "version": "1.0.0"}
    assert any("no-such-step' does not resolve to a real step id" in issue for issue in data["issues"])


def test_validate_json_reports_parse_error(tmp_path: Path, runner: CliRunner):
    folder = tmp_path / "empty"
    folder.mkdir()

    result = runner.invoke(cli, ["validate", str(folder), "--json"])

    assert result.exit_code == 1
    data = json.loads(result.output)
    assert data["valid"] is False
    assert data["build"] is None
    assert data["counts"] is None
    assert "manifest.atsx.yaml" in data["issues"][0]


def test_status_json_shape(tmp_path: Path, runner: CliRunner):
    folder = make_project(tmp_path, "proj", MANIFEST_WITH_BRANCH, state=STATE_IN_PROGRESS)

    result = runner.invoke(cli, ["status", str(folder), "--json"])

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)

    assert data["meta"]["id"] == "widget-mount"
    assert data["meta"]["version"] == "1.0.0"
    assert data["warnings"] == []
    assert data["state_instances"] == {"count": 1, "names": ["state.atsx.yaml"], "using": "state.atsx.yaml"}
    assert {r["id"] for r in data["resources"]} == {"cad-file", "screws"}

    # cut-mount is hidden: laser-cut option wasn't chosen (fabrication-method: 3d-print)
    all_top_ids = {s["id"] for s in data["steps"]}
    assert all_top_ids == {"prep", "print-mount", "cut-mount", "assemble"}
    assert data["steps"][0]["id"] == "prep"

    prep = find_step(data["steps"], "prep")
    assert prep["status"] == "done"
    print_mount = find_step(data["steps"], "print-mount")
    assert print_mount["status"] == "in_progress"
    cut_mount = find_step(data["steps"], "cut-mount")
    assert cut_mount["visible"] is False

    assemble = find_step(data["steps"], "assemble")
    assert assemble["kind"] == "group"
    assert [s["id"] for s in assemble["steps"]] == ["attach", "route"]

    branch = data["branches"][0]
    assert branch["id"] == "fabrication-method"
    assert branch["chosen"] == "3d-print"
    assert {o["value"] for o in branch["options"]} == {"3d-print", "laser-cut"}

    # visible steps: prep, print-mount, assemble, attach, route (cut-mount hidden) = 5, 1 done
    assert data["progress_summary"] == {"total": 5, "done": 1, "percent": 20.0}


def test_status_json_drift_warning(tmp_path: Path, runner: CliRunner):
    drifted_state = STATE_IN_PROGRESS.replace('spec_version: "1.0.0"', 'spec_version: "0.9.0"')
    folder = make_project(tmp_path, "proj", MANIFEST_WITH_BRANCH, state=drifted_state)

    result = runner.invoke(cli, ["status", str(folder), "--json"])

    assert result.exit_code == 0
    data = json.loads(result.output)
    assert len(data["warnings"]) == 1
    assert "0.9.0" in data["warnings"][0]


def test_status_json_no_state_all_visible(tmp_path: Path, runner: CliRunner):
    folder = make_project(tmp_path, "proj", MANIFEST_WITH_BRANCH)

    result = runner.invoke(cli, ["status", str(folder), "--json"])

    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["state_instances"] == {"count": 0, "names": [], "using": None}
    assert all(s["visible"] for s in data["steps"])  # no branch choice yet -> nothing hidden
    assert data["progress_summary"] == {"total": 6, "done": 0, "percent": 0.0}


def test_mark_creates_fresh_state(tmp_path: Path, runner: CliRunner):
    folder = make_project(tmp_path, "proj", MANIFEST_WITH_BRANCH)

    result = runner.invoke(cli, ["mark", str(folder), "prep", "done"])

    assert result.exit_code == 0, result.output
    state = yaml.safe_load((folder / "state.atsx.yaml").read_text())
    assert state["spec_id"] == "widget-mount"
    assert state["spec_version"] == "1.0.0"
    assert state["progress"]["prep"]["status"] == "done"
    assert "completed_at" in state["progress"]["prep"]


def test_mark_updates_existing_state_preserves_other_entries(tmp_path: Path, runner: CliRunner):
    folder = make_project(tmp_path, "proj", MANIFEST_WITH_BRANCH, state=STATE_IN_PROGRESS)

    result = runner.invoke(cli, ["mark", str(folder), "print-mount", "done"])

    assert result.exit_code == 0, result.output
    state = yaml.safe_load((folder / "state.atsx.yaml").read_text())
    assert state["progress"]["prep"]["status"] == "done"  # untouched
    assert state["progress"]["print-mount"]["status"] == "done"
    assert "completed_at" in state["progress"]["print-mount"]
    assert state["branch_choices"] == {"fabrication-method": "3d-print"}  # untouched


def test_mark_clears_completed_at_when_moved_off_done(tmp_path: Path, runner: CliRunner):
    folder = make_project(tmp_path, "proj", MANIFEST_WITH_BRANCH)
    runner.invoke(cli, ["mark", str(folder), "prep", "done"])

    result = runner.invoke(cli, ["mark", str(folder), "prep", "todo"])

    assert result.exit_code == 0, result.output
    state = yaml.safe_load((folder / "state.atsx.yaml").read_text())
    assert state["progress"]["prep"]["status"] == "todo"
    assert "completed_at" not in state["progress"]["prep"]


def test_mark_rejects_unknown_step(tmp_path: Path, runner: CliRunner):
    folder = make_project(tmp_path, "proj", MANIFEST_WITH_BRANCH)

    result = runner.invoke(cli, ["mark", str(folder), "no-such-step", "done"])

    assert result.exit_code == 1
    assert "does not resolve to a real step id" in result.output


def test_mark_rejects_invalid_status(tmp_path: Path, runner: CliRunner):
    folder = make_project(tmp_path, "proj", MANIFEST_WITH_BRANCH)

    result = runner.invoke(cli, ["mark", str(folder), "prep", "not-a-status"])

    assert result.exit_code == 2  # click's own Choice validation error


def test_mark_on_packed_atsx_preserves_other_members(tmp_path: Path, runner: CliRunner):
    folder = make_project(tmp_path, "proj", MANIFEST_WITH_BRANCH)
    packed = tmp_path / "out.atsx"
    runner.invoke(cli, ["pack", str(folder), "-o", str(packed)])

    result = runner.invoke(cli, ["mark", str(packed), "prep", "in_progress"])
    assert result.exit_code == 0, result.output

    with zipfile.ZipFile(packed) as zf:
        names = set(zf.namelist())
        assert names == {"manifest.atsx.yaml", "resources/mount.svg", "state.atsx.yaml"}
        assert zf.read("resources/mount.svg") == b"<svg/>"
        assert zf.getinfo("manifest.atsx.yaml").compress_type == zipfile.ZIP_STORED
        assert zf.getinfo("state.atsx.yaml").compress_type == zipfile.ZIP_STORED
        state = yaml.safe_load(zf.read("state.atsx.yaml"))
        assert state["progress"]["prep"]["status"] == "in_progress"

    # status --json still loads cleanly after the rewrite
    status_result = runner.invoke(cli, ["status", str(packed), "--json"])
    assert status_result.exit_code == 0, status_result.output
    data = json.loads(status_result.output)
    assert find_step(data["steps"], "prep")["status"] == "in_progress"
