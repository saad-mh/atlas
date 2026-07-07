"""Step-DAG utilities for the process layer (README.md §5).

Pure, dependency-free graph logic (flattening nested `group` steps, topological ordering, cycle detection) that both the CLI and a future GUI reader need. Deliberately has no CLI dependencies so it stays importable as part of the core alongside parser.py/schemas.py.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class FlatStep:
    """A process step flattened out of the nested `steps:` tree, with its position in that tree preserved via `parent_id`/`depth` (README §5)."""

    id: str
    raw: dict[str, Any]
    parent_id: str | None
    depth: int

    @property
    def title(self) -> str:
        return self.raw.get("title", self.id)

    @property
    def depends_on(self) -> list[str]:
        return self.raw.get("depends_on") or []

    @property
    def kind(self) -> str:
        return self.raw.get("kind", "task")


class CycleError(Exception):
    """The step DAG contains a cycle."""

    def __init__(self, cycle_ids: list[str]) -> None:
        self.cycle_ids = cycle_ids
        super().__init__(f"cycle detected among steps: {', '.join(cycle_ids)}")


def flatten_steps(process: list[dict[str, Any]]) -> list[FlatStep]:
    """Walk `process:` (and any nested `steps:`) into a flat, pre-order list.

    Steps with malformed/non-dict entries are skipped - schema validation is responsible for reporting that; this function just needs to not crash on it so callers can still get a best-effort view.
    """
    flat: list[FlatStep] = []

    def _walk(steps: list[Any], parent_id: str | None, depth: int) -> None:
        for step in steps:
            if not isinstance(step, dict) or not isinstance(step.get("id"), str):
                continue
            flat.append(FlatStep(id=step["id"], raw=step, parent_id=parent_id, depth=depth))
            nested = step.get("steps")
            if isinstance(nested, list):
                _walk(nested, step["id"], depth + 1)

    _walk(process or [], None, 0)
    return flat


def find_duplicate_ids(flat_steps: list[FlatStep]) -> list[str]:
    """Step ids that appear more than once across the whole flattened tree."""
    seen: set[str] = set()
    dupes: list[str] = []
    for step in flat_steps:
        if step.id in seen and step.id not in dupes:
            dupes.append(step.id)
        seen.add(step.id)
    return dupes


def topological_sort(flat_steps: list[FlatStep]) -> list[FlatStep]:
    """Kahn's-algorithm topological sort over the full flattened step set.

    Edges are `depends_on` -> step. Edges pointing at an id that isn't in `flat_steps` are ignored here (its a dangling-reference concern for the caller to report, not a graph concern). Raises CycleError if a cycle prevents a full ordering.
    """
    by_id = {step.id: step for step in flat_steps}
    in_degree = {step.id: 0 for step in flat_steps}
    dependents: dict[str, list[str]] = {step.id: [] for step in flat_steps}

    for step in flat_steps:
        deps = [d for d in step.depends_on if d in by_id]
        in_degree[step.id] = len(deps)
        for dep in deps:
            dependents[dep].append(step.id)

    ready = [step_id for step_id, deg in in_degree.items() if deg == 0]
    ready.sort(key=lambda step_id: flat_steps.index(by_id[step_id]))
    ordered: list[FlatStep] = []

    while ready:
        step_id = ready.pop(0)
        ordered.append(by_id[step_id])
        for dependent in dependents[step_id]:
            in_degree[dependent] -= 1
            if in_degree[dependent] == 0:
                ready.append(dependent)
        ready.sort(key=lambda sid: flat_steps.index(by_id[sid]))

    if len(ordered) < len(flat_steps):
        remaining = [step.id for step in flat_steps if step.id not in {s.id for s in ordered}]
        raise CycleError(remaining)

    return ordered
