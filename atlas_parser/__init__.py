"""atlas_parser: read + validate ATLAS .atsx containers (see README.md).

    from atlas_parser import parse_atsx
    container = parse_atsx("my-build.atsx")
    container.manifest        # validated manifest dict
    container.state           # validated state dict, or None
    container.warnings        # e.g. spec_version drift (README §6.3)
"""

from .errors import (
    AtsxError,
    AtsxNotFoundError,
    ManifestMissingError,
    SchemaValidationError,
    YamlParseError,
)
from .parser import (
    AtsxContainer,
    parse_atsx,
    parse_manifest_file,
    parse_state_file,
)

__all__ = [
    "AtsxContainer",
    "parse_atsx",
    "parse_manifest_file",
    "parse_state_file",
    "AtsxError",
    "AtsxNotFoundError",
    "ManifestMissingError",
    "SchemaValidationError",
    "YamlParseError",
]
