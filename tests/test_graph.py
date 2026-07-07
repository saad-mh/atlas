from __future__ import annotations

import pytest

from atlas_parser.graph import CycleError, find_duplicate_ids, flatten_steps, topological_sort

PROCESS = [
    {"id": "a", "title": "A", "depends_on": []},
    {"id": "b", "title": "B", "depends_on": ["a"]},
    {
        "id": "group",
        "title": "Group",
        "depends_on": ["a"],
        "kind": "group",
        "steps": [
            {"id": "g1", "title": "G1", "depends_on": []},
            {"id": "g2", "title": "G2", "depends_on": ["g1"]},
        ],
    },
]


def test_flatten_steps_preserves_nesting():
    flat = flatten_steps(PROCESS)

    assert [s.id for s in flat] == ["a", "b", "group", "g1", "g2"]
    assert [s.parent_id for s in flat] == [None, None, None, "group", "group"]
    assert [s.depth for s in flat] == [0, 0, 0, 1, 1]


def test_flatten_steps_skips_malformed_entries():
    flat = flatten_steps([{"id": "a", "depends_on": []}, "not-a-dict", {"depends_on": []}])

    assert [s.id for s in flat] == ["a"]


def test_find_duplicate_ids():
    flat = flatten_steps(
        [
            {"id": "a", "depends_on": []},
            {"id": "a", "depends_on": []},
            {"id": "b", "depends_on": [], "steps": [{"id": "a", "depends_on": []}]},
        ]
    )

    assert find_duplicate_ids(flat) == ["a"]


def test_topological_sort_orders_dependencies_first():
    flat = flatten_steps(PROCESS)

    ordered_ids = [s.id for s in topological_sort(flat)]

    assert ordered_ids.index("a") < ordered_ids.index("b")
    assert ordered_ids.index("a") < ordered_ids.index("group")
    assert ordered_ids.index("g1") < ordered_ids.index("g2")
    assert set(ordered_ids) == {"a", "b", "group", "g1", "g2"}


def test_topological_sort_raises_on_cycle():
    cyclic = [
        {"id": "a", "depends_on": ["c"]},
        {"id": "b", "depends_on": ["a"]},
        {"id": "c", "depends_on": ["b"]},
    ]
    flat = flatten_steps(cyclic)

    with pytest.raises(CycleError) as exc_info:
        topological_sort(flat)

    assert set(exc_info.value.cycle_ids) == {"a", "b", "c"}


def test_topological_sort_ignores_dangling_depends_on():
    flat = flatten_steps([{"id": "a", "depends_on": ["does-not-exist"]}])

    ordered_ids = [s.id for s in topological_sort(flat)]

    assert ordered_ids == ["a"]
