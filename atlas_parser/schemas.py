"""Loads and applies the JSON Schemas that validate manifest.atsx.yaml and state.atsx.yaml documents (README.md §3-§6).

This is schema-level validation only: field names, types, enums, and which fields are required. It does not check cross-references such as depends_on/requires_resources/part_of/chosen_step pointing at ids that actually exist, or that the process graph is acyclic - per the schema docs themselves, that's left to a future `atlas validate` CLI (README §9), not this module.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator

from .errors import SchemaValidationError

SCHEMA_DIR = Path(__file__).resolve().parent.parent / "schemas"
MANIFEST_SCHEMA_PATH = SCHEMA_DIR / "manifest.schema.yaml"
STATE_SCHEMA_PATH = SCHEMA_DIR / "state.schema.yaml"


@lru_cache(maxsize=None)
def _load_validator(schema_path: Path) -> Draft202012Validator:
    with open(schema_path, "r", encoding="utf-8") as f:
        schema = yaml.safe_load(f)
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def _validate(data: Any, schema_path: Path, source: str) -> None:
    validator = _load_validator(schema_path)
    errors = sorted(validator.iter_errors(data), key=lambda e: str(list(e.path)))
    if errors:
        raise SchemaValidationError(source, errors)


def validate_manifest(data: Any, *, source: str = "manifest.atsx.yaml") -> None:
    """Validate a parsed manifest document against schemas/manifest.schema.yaml."""
    _validate(data, MANIFEST_SCHEMA_PATH, source)


def validate_state(data: Any, *, source: str = "state.atsx.yaml") -> None:
    """Validate a parsed state document against schemas/state.schema.yaml."""
    _validate(data, STATE_SCHEMA_PATH, source)
