from __future__ import annotations

from pathlib import Path

import pytest

from atlas_parser import (
    AtsxNotFoundError,
    ManifestMissingError,
    SchemaValidationError,
    YamlParseError,
    parse_atsx,
    parse_manifest_file,
    parse_state_file,
)

from .conftest import (
    DRIFTED_STATE,
    INVALID_MANIFEST_MISSING_KIND,
    MALFORMED_YAML,
    VALID_MANIFEST,
    VALID_STATE,
    make_atsx,
)


def test_parses_valid_container(valid_atsx: Path):
    container = parse_atsx(valid_atsx)

    assert container.manifest["meta"]["id"] == "mars-rover-nav-pipeline"
    assert [s["id"] for s in container.manifest["process"]] == ["setup-env", "download-vlm"]
    assert container.state["spec_id"] == "mars-rover-nav-pipeline"
    assert container.states == {"state.atsx.yaml": container.state}
    assert container.resource_files == ["resources/environment.yml"]
    assert container.attachment_files == ["attachments/notes.txt"]
    assert container.warnings == []


def test_reads_bundled_resource_and_attachment_bytes(valid_atsx: Path):
    container = parse_atsx(valid_atsx)

    assert container.read_resource("environment.yml") == b"name: rover-env\ndependencies: [python=3.10]\n"
    assert container.read_resource("resources/environment.yml") == container.read_resource("environment.yml")
    assert container.read_attachment("notes.txt") == b"wiring notes"


def test_missing_manifest_raises(tmp_path: Path):
    atsx = make_atsx(tmp_path / "no-manifest.atsx", {"state.atsx.yaml": VALID_STATE})

    with pytest.raises(ManifestMissingError):
        parse_atsx(atsx)


def test_not_a_zip_raises(tmp_path: Path):
    bogus = tmp_path / "bogus.atsx"
    bogus.write_bytes(b"not a zip file at all")

    with pytest.raises(AtsxNotFoundError):
        parse_atsx(bogus)


def test_nonexistent_path_raises(tmp_path: Path):
    with pytest.raises(AtsxNotFoundError):
        parse_atsx(tmp_path / "does-not-exist.atsx")


def test_malformed_yaml_raises(tmp_path: Path):
    atsx = make_atsx(tmp_path / "bad-yaml.atsx", {"manifest.atsx.yaml": MALFORMED_YAML})

    with pytest.raises(YamlParseError):
        parse_atsx(atsx)


def test_schema_violation_raises(tmp_path: Path):
    atsx = make_atsx(
        tmp_path / "invalid.atsx",
        {"manifest.atsx.yaml": INVALID_MANIFEST_MISSING_KIND},
    )

    with pytest.raises(SchemaValidationError) as exc_info:
        parse_atsx(atsx)
    assert "kind" in str(exc_info.value)


def test_no_state_is_none(tmp_path: Path):
    atsx = make_atsx(tmp_path / "no-state.atsx", {"manifest.atsx.yaml": VALID_MANIFEST})

    container = parse_atsx(atsx)

    assert container.states == {}
    assert container.state is None


def test_drift_warning_when_state_version_differs(tmp_path: Path):
    atsx = make_atsx(
        tmp_path / "drift.atsx",
        {"manifest.atsx.yaml": VALID_MANIFEST, "state.atsx.yaml": DRIFTED_STATE},
    )

    container = parse_atsx(atsx)

    assert len(container.warnings) == 1
    assert "spec_version" in container.warnings[0]


def test_multiple_instance_state_docs(tmp_path: Path):
    bob_state = VALID_STATE.replace('instance_id: "test-instance"', 'instance_id: "bob-local"')
    atsx = make_atsx(
        tmp_path / "multi-state.atsx",
        {
            "manifest.atsx.yaml": VALID_MANIFEST,
            "state.atsx.yaml": VALID_STATE,
            "state.bob-local.atsx.yaml": bob_state,
        },
    )

    container = parse_atsx(atsx)

    assert set(container.states) == {"state.atsx.yaml", "state.bob-local.atsx.yaml"}
    assert container.state == container.states["state.atsx.yaml"]


def test_sole_named_state_doc_used_as_default(tmp_path: Path):
    bob_state = VALID_STATE.replace('instance_id: "test-instance"', 'instance_id: "bob-local"')
    atsx = make_atsx(
        tmp_path / "named-state.atsx",
        {"manifest.atsx.yaml": VALID_MANIFEST, "state.bob-local.atsx.yaml": bob_state},
    )

    container = parse_atsx(atsx)

    assert container.state == container.states["state.bob-local.atsx.yaml"]


def test_parse_loose_manifest_and_state_files(tmp_path: Path):
    manifest_path = tmp_path / "manifest.atsx.yaml"
    manifest_path.write_text(VALID_MANIFEST)
    state_path = tmp_path / "state.atsx.yaml"
    state_path.write_text(VALID_STATE)

    manifest = parse_manifest_file(manifest_path)
    state = parse_state_file(state_path)

    assert manifest["meta"]["id"] == "mars-rover-nav-pipeline"
    assert state["spec_id"] == "mars-rover-nav-pipeline"


def test_parse_loose_manifest_file_missing_raises(tmp_path: Path):
    with pytest.raises(AtsxNotFoundError):
        parse_manifest_file(tmp_path / "missing.atsx.yaml")
