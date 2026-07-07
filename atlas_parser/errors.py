"""Exceptions raised while parsing or validating an .atsx container."""

from __future__ import annotations

from typing import Any, Sequence


class AtsxError(Exception):
    """Base class for all atlas_parser errors."""


class AtsxNotFoundError(AtsxError):
    """The .atsx path doesn't exist, or isn't a valid zip container."""


class ManifestMissingError(AtsxError):
    """manifest.atsx.yaml is required but absent from the container (README §2)."""


class YamlParseError(AtsxError):
    """A document's bytes aren't valid YAML."""

    def __init__(self, source: str, cause: Exception) -> None:
        self.source = source
        self.cause = cause
        super().__init__(f"{source}: invalid YAML - {cause}")


class SchemaValidationError(AtsxError):
    """A parsed document doesn't match its JSON Schema."""

    def __init__(self, source: str, errors: Sequence[Any]) -> None:
        self.source = source
        self.errors = list(errors)
        lines = [f"[err] {source}: schema validation failed ({len(self.errors)} error(s)):"]
        for err in self.errors:
            loc = "/".join(str(p) for p in err.path) or "<root>"
            lines.append(f"  - {loc}: {err.message}")
        super().__init__("\n".join(lines))
