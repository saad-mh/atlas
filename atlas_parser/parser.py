"""Parser for ATLAS .atsx containers (README.md §2-§6).

An .atsx file is a zip archive holding manifest.atsx.yaml (required), an optional state.atsx.yaml - or several state.<instance_id>.atsx.yaml sidecars for multiple builders (README §6.1) - and optional resources/ and attachments/ directories. This module opens that container, parses its YAML documents, validates them against the JSON Schemas in schemas/, and returns a structured AtsxContainer.
"""

from __future__ import annotations

import datetime
import time
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from .errors import (
    AtsxNotFoundError,
    ManifestMissingError,
    YamlParseError,
)
from .schemas import validate_manifest, validate_state

MANIFEST_NAME = "manifest.atsx.yaml"
STATE_NAME = "state.atsx.yaml"


def _is_state_filename(name: str) -> bool:
    """state.atsx.yaml or state.<instance_id>.atsx.yaml, at container root (README §6.1)."""
    if "/" in name or not name.endswith(".atsx.yaml"):
        return False
    stem = name[: -len(".atsx.yaml")]
    return stem == "state" or stem.startswith("state.")


def _normalize_yaml_dates(value: Any) -> Any:
    """PyYAML auto-parses unquoted dates/timestamps (e.g. `created: 2026-07-07`) into datetime.date/datetime objects. The schemas declare these fields as JSON strings (format: date/date-time), so stringify them back to ISO 8601 before validation."""
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _normalize_yaml_dates(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_normalize_yaml_dates(v) for v in value]
    return value


def _load_yaml(raw: bytes, source: str) -> Any:
    try:
        data = yaml.safe_load(raw)
    except yaml.YAMLError as exc:
        raise YamlParseError(source, exc) from exc
    return _normalize_yaml_dates(data)


def _check_drift(manifest: dict, states: dict[str, dict]) -> list[str]:
    """spec_id/spec_version vs manifest.meta mismatch is a non-blocking warning, not an error - the spec may have changed since a given state document's build started."""
    meta = manifest.get("meta") or {}
    warnings: list[str] = []
    for name, state in states.items():
        if not isinstance(state, dict):
            continue
        if state.get("spec_id") != meta.get("id"):
            warnings.append(
                f"[warn] {name}: spec_id '{state.get('spec_id')}' does not match manifest meta.id '{meta.get('id')}'"
            )
        if state.get("spec_version") != meta.get("version"):
            warnings.append(
                f"[warn] {name}: spec_version '{state.get('spec_version')}' differs from manifest meta.version '{meta.get('version')}' - spec may have changed since this build started."
            )
    return warnings


@dataclass
class AtsxContainer:
    """A parsed, schema-validated .atsx container."""

    path: Path
    manifest: dict
    states: dict[str, dict] = field(default_factory=dict)
    resource_files: list[str] = field(default_factory=list)
    attachment_files: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def state(self) -> dict | None:
        """The default state.atsx.yaml, or the sole state doc if only one is present."""
        if "state.atsx.yaml" in self.states:
            return self.states["state.atsx.yaml"]
        if len(self.states) == 1:
            return next(iter(self.states.values()))
        return None

    def read_resource(self, relative_path: str) -> bytes:
        """Read a bundled file's bytes from resources/ inside the .atsx (README §4.2)."""
        name = relative_path if relative_path.startswith("resources/") else f"resources/{relative_path}"
        return self._read_member(name)

    def read_attachment(self, relative_path: str) -> bytes:
        """Read a bundled file's bytes from attachments/ inside the .atsx (README §2)."""
        name = relative_path if relative_path.startswith("attachments/") else f"attachments/{relative_path}"
        return self._read_member(name)

    def _read_member(self, name: str) -> bytes:
        with zipfile.ZipFile(self.path) as zf:
            return zf.read(name)


def parse_atsx(path: str | Path) -> AtsxContainer:
    """Open, parse, and validate an .atsx container."""
    path = Path(path)
    if not path.is_file():
        raise AtsxNotFoundError(f"[error] '{path}' does not exist or is not a file")

    try:
        zf = zipfile.ZipFile(path)
    except zipfile.BadZipFile as exc:
        raise AtsxNotFoundError(f"[error] '{path}' is not a valid .atsx container") from exc

    with zf:
        names = zf.namelist()

        if MANIFEST_NAME not in names:
            raise ManifestMissingError(
                f"[error] '{path}' has no top-level {MANIFEST_NAME}"
            )

        manifest = _load_yaml(zf.read(MANIFEST_NAME), MANIFEST_NAME)
        validate_manifest(manifest, source=MANIFEST_NAME)

        states: dict[str, dict] = {}
        for name in names:
            if _is_state_filename(name):
                state_doc = _load_yaml(zf.read(name), name)
                validate_state(state_doc, source=name)
                states[name] = state_doc

        resource_files = sorted(n for n in names if n.startswith("resources/") and not n.endswith("/"))
        attachment_files = sorted(n for n in names if n.startswith("attachments/") and not n.endswith("/"))

    return AtsxContainer(
        path=path,
        manifest=manifest,
        states=states,
        resource_files=resource_files,
        attachment_files=attachment_files,
        warnings=_check_drift(manifest, states),
    )


def parse_manifest_file(path: str | Path) -> dict:
    """Parse + validate a manifest.atsx.yaml from disk."""
    path = Path(path)
    if not path.is_file():
        raise AtsxNotFoundError(f"[error] '{path}' does not exist or is not a file")
    data = _load_yaml(path.read_bytes(), str(path))
    validate_manifest(data, source=str(path))
    return data


def parse_state_file(path: str | Path) -> dict:
    """Parse + validate a state.atsx.yaml from disk."""
    path = Path(path)
    if not path.is_file():
        raise AtsxNotFoundError(f"[error] '{path}' does not exist or is not a file")
    data = _load_yaml(path.read_bytes(), str(path))
    validate_state(data, source=str(path))
    return data


def _dump_state_yaml(state: dict) -> bytes:
    return yaml.safe_dump(state, sort_keys=False, default_flow_style=False).encode("utf-8")


def write_state_file(path: str | Path, state: dict) -> None:
    """Write STATE as state.atsx.yaml at PATH inside an unpacked project folder (README §2)."""
    Path(path).write_bytes(_dump_state_yaml(state))


def write_state_to_atsx(atsx_path: str | Path, state: dict) -> None:
    """Replace (or add) state.atsx.yaml inside an existing .atsx zip, leaving every other member - including any state.<instance_id>.atsx.yaml sidecars (README §6.1) - byte-identical.

    zipfile has no in-place update, so this rebuilds the archive into a sibling temp file and atomically swaps it in.
    """
    atsx_path = Path(atsx_path)
    zinfo = zipfile.ZipInfo(STATE_NAME, date_time=time.localtime()[:6])
    zinfo.compress_type = zipfile.ZIP_STORED

    tmp_path = atsx_path.with_name(atsx_path.name + ".tmp")
    with zipfile.ZipFile(atsx_path) as src, zipfile.ZipFile(tmp_path, "w") as dst:
        for item in src.infolist():
            if item.filename == STATE_NAME:
                continue
            dst.writestr(item, src.read(item.filename))
        dst.writestr(zinfo, _dump_state_yaml(state))
    tmp_path.replace(atsx_path)
