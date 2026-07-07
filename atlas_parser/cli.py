"""`atlas` CLI: pack/unpack/validate/status for .atsx containers.

A thin layer over atlas_parser's core: this module is the onlyx place in the package allowed to depend on click.
"""

from __future__ import annotations

import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import click

from . import graph
from .errors import AtsxError
from .parser import MANIFEST_NAME, parse_atsx, parse_manifest_file, parse_state_file

STATE_NAME = "state.atsx.yaml"
RESOURCES_DIR = "resources"
ATTACHMENTS_DIR = "attachments"

STATUS_MARKERS = {
    "done": "[x]",
    "todo": "[ ]",
    "in_progress": "[~]",
    "blocked": "[!]",
    "skipped": "[-]",
}


@dataclass
class LoadedProject:
    """A schema-validated manifest/state pair plus the set of file paths physically present, normalized across both packed-.atsx and unpacked-folder cases."""

    manifest: dict[str, Any]
    state: dict[str, Any] | None
    file_names: set[str]


def _load_project(path: Path) -> LoadedProject:
    """Load + schema-validate a manifest/state pair from either a packed .atsx file or a raw unpacked project folder."""
    if path.is_dir():
        manifest_path = path / MANIFEST_NAME
        if not manifest_path.is_file():
            raise AtsxError(f"[error] '{path}' has no top-level {MANIFEST_NAME}")
        manifest = parse_manifest_file(manifest_path)
        state_path = path / STATE_NAME
        state = parse_state_file(state_path) if state_path.is_file() else None
        file_names = {
            str(p.relative_to(path).as_posix())
            for p in path.rglob("*")
            if p.is_file()
        }
        return LoadedProject(manifest=manifest, state=state, file_names=file_names)

    container = parse_atsx(path)
    with zipfile.ZipFile(path) as zf:
        file_names = set(zf.namelist())
    return LoadedProject(manifest=container.manifest, state=container.state, file_names=file_names)


def _semantic_issues(manifest: dict[str, Any], state: dict[str, Any] | None, file_names: set[str]) -> list[str]:
    """Cross-reference checks the JSON Schema can't express: dangling ids, DAG cycles, and bundle paths that don't actually exist."""
    issues: list[str] = []

    resources = manifest.get("resources") or []
    resources_by_id = {r["id"]: r for r in resources if isinstance(r, dict) and isinstance(r.get("id"), str)}

    flat_steps = graph.flatten_steps(manifest.get("process") or [])
    step_ids = {s.id for s in flat_steps}

    for dup in graph.find_duplicate_ids(flat_steps):
        issues.append(f"process: duplicate step id '{dup}'")

    for step in flat_steps:
        for dep in step.depends_on:
            if dep not in step_ids:
                issues.append(f"process[{step.id}].depends_on: '{dep}' does not resolve to a real step id")
        for res in step.raw.get("requires_resources") or []:
            if res not in resources_by_id:
                issues.append(f"process[{step.id}].requires_resources: '{res}' does not resolve to a real resource id")

    try:
        graph.topological_sort(flat_steps)
    except graph.CycleError as exc:
        issues.append(f"process: cycle detected among steps: {', '.join(exc.cycle_ids)}")

    for rid, resource in resources_by_id.items():
        part_of = resource.get("part_of")
        if part_of is not None:
            parent = resources_by_id.get(part_of)
            if parent is None:
                issues.append(f"resources[{rid}].part_of: '{part_of}' does not resolve to a real resource id")
            elif parent.get("type") != "subassembly":
                issues.append(f"resources[{rid}].part_of: '{part_of}' is not a subassembly-type resource")
        bundle = resource.get("bundle")
        if bundle and bundle not in file_names:
            issues.append(f"resources[{rid}].bundle: '{bundle}' does not exist in the archive/folder")

    branches = manifest.get("branches") or []
    branch_ids: set[str] = set()
    branches_by_id: dict[str, dict] = {}
    for branch in branches:
        if not isinstance(branch, dict):
            continue
        bid = branch.get("id", "<unknown>")
        branch_ids.add(bid)
        branches_by_id[bid] = branch
        for option in branch.get("options") or []:
            if not isinstance(option, dict):
                continue
            for chosen in option.get("chosen_step") or []:
                if chosen not in step_ids:
                    issues.append(
                        f"branches[{bid}].options[{option.get('value')}].chosen_step: "
                        f"'{chosen}' does not resolve to a real step id"
                    )

    if state is not None:
        for step_id in state.get("progress") or {}:
            if step_id not in step_ids:
                issues.append(f"state.progress: '{step_id}' does not resolve to a real step id")
        for branch_id, chosen_value in (state.get("branch_choices") or {}).items():
            branch = branches_by_id.get(branch_id)
            if branch is None:
                issues.append(f"state.branch_choices: '{branch_id}' does not resolve to a real branch id")
                continue
            valid_values = {o.get("value") for o in branch.get("options") or [] if isinstance(o, dict)}
            if chosen_value not in valid_values:
                issues.append(f"state.branch_choices['{branch_id}']: '{chosen_value}' is not a valid option value")

    return issues


def _visible_step_ids(manifest: dict[str, Any], state: dict[str, Any] | None) -> set[str]:
    """Steps activated by branch choices already made, plus any step never gated by a branch at all."""
    flat_steps = graph.flatten_steps(manifest.get("process") or [])
    all_ids = {s.id for s in flat_steps}
    branches = manifest.get("branches") or []
    branch_choices = (state.get("branch_choices") if state else {}) or {}

    hidden: set[str] = set()
    for branch in branches:
        if not isinstance(branch, dict):
            continue
        chosen_value = branch_choices.get(branch.get("id"))
        if chosen_value is None:
            continue  # no choice made yet -> don't hide anything for this branch
        chosen_ids: set[str] = set()
        other_ids: set[str] = set()
        for option in branch.get("options") or []:
            if not isinstance(option, dict):
                continue
            bucket = chosen_ids if option.get("value") == chosen_value else other_ids
            bucket.update(option.get("chosen_step") or [])
        hidden |= other_ids - chosen_ids

    return all_ids - hidden


@click.group()
def cli() -> None:
    """atlas: pack, unpack, validate, and inspect .atsx build containers."""


@cli.command()
@click.argument("folder", type=click.Path(exists=True, file_okay=False, path_type=Path))
@click.option(
    "-o", "--output", "output", type=click.Path(path_type=Path), default=None,
    help="Output .atsx path (default: <meta.id>.atsx in the current directory).",
)
def pack(folder: Path, output: Path | None) -> None:
    """Zip FOLDER (manifest.atsx.yaml + optional state/resources/attachments) into a .atsx file."""
    manifest_path = folder / MANIFEST_NAME
    if not manifest_path.is_file():
        click.echo(f"[error] '{folder}' has no top-level {MANIFEST_NAME}", err=True)
        raise SystemExit(1)

    state_path = folder / STATE_NAME
    try:
        manifest = parse_manifest_file(manifest_path)
        if state_path.is_file():
            parse_state_file(state_path)
    except AtsxError as exc:
        click.echo("INVALID - refusing to pack:", err=True)
        click.echo(str(exc), err=True)
        raise SystemExit(1)

    if output is None:
        output = Path(f"{manifest['meta']['id']}.atsx")

    with zipfile.ZipFile(output, "w") as zf:
        zf.write(manifest_path, MANIFEST_NAME, compress_type=zipfile.ZIP_STORED)
        if state_path.is_file():
            zf.write(state_path, STATE_NAME, compress_type=zipfile.ZIP_STORED)
        for subdir in (RESOURCES_DIR, ATTACHMENTS_DIR):
            src_dir = folder / subdir
            if not src_dir.is_dir():
                continue
            for file_path in sorted(src_dir.rglob("*")):
                if file_path.is_file():
                    arcname = f"{subdir}/{file_path.relative_to(src_dir).as_posix()}"
                    zf.write(file_path, arcname, compress_type=zipfile.ZIP_DEFLATED)

    click.echo(f"Packed '{folder}' -> '{output}'")


@cli.command()
@click.argument("file", type=click.Path(exists=True, dir_okay=False, path_type=Path))
@click.option(
    "-o", "--output", "output", type=click.Path(path_type=Path), default=None,
    help="Output folder (default: FILE's name without extension, in the current directory).",
)
@click.option("--force", is_flag=True, help="Allow extracting into an existing non-empty folder.")
def unpack(file: Path, output: Path | None, force: bool) -> None:
    """Unzip FILE (.atsx) into a folder."""
    if output is None:
        output = Path(file.stem)

    if output.exists():
        if not output.is_dir():
            click.echo(f"[error] '{output}' exists and is not a folder", err=True)
            raise SystemExit(1)
        if any(output.iterdir()) and not force:
            click.echo(f"[error] '{output}' already exists and is not empty (use --force to overwrite)", err=True)
            raise SystemExit(1)
    else:
        output.mkdir(parents=True)

    try:
        zf = zipfile.ZipFile(file)
    except zipfile.BadZipFile:
        click.echo(f"[error] '{file}' is not a valid .atsx container", err=True)
        raise SystemExit(1)

    with zf:
        output_resolved = output.resolve()
        for member in zf.infolist():
            member_path = (output_resolved / member.filename).resolve()
            if not member_path.is_relative_to(output_resolved):
                click.echo(
                    f"[error] '{file}' contains an unsafe path outside the target folder: '{member.filename}'",
                    err=True,
                )
                raise SystemExit(1)
        zf.extractall(output_resolved)

    click.echo(f"Unpacked '{file}' -> '{output}'")


@cli.command()
@click.argument("path", type=click.Path(exists=True, path_type=Path))
def validate(path: Path) -> None:
    """Validate a packed .atsx file or an unpacked project folder."""
    try:
        project = _load_project(path)
    except AtsxError as exc:
        click.echo(f"INVALID: {path}")
        click.echo(str(exc))
        raise SystemExit(1)

    issues = _semantic_issues(project.manifest, project.state, project.file_names)
    meta = project.manifest.get("meta", {})

    if issues:
        click.echo(f"INVALID: {path}")
        click.echo(f"  build: {meta.get('id')} v{meta.get('version')}")
        click.echo(f"  {len(issues)} issue(s) found:")
        for issue in issues:
            click.echo(f"  - {issue}")
        raise SystemExit(1)

    click.echo(f"OK: {path}")
    click.echo(f"  build: {meta.get('id')} v{meta.get('version')}")
    click.echo(f"  process steps: {len(graph.flatten_steps(project.manifest.get('process') or []))}")
    click.echo(f"  resources: {len(project.manifest.get('resources') or [])}")


@cli.command()
@click.argument("path", type=click.Path(exists=True, path_type=Path))
def status(path: Path) -> None:
    """Print build progress as a dependency-ordered tree."""
    try:
        project = _load_project(path)
    except AtsxError as exc:
        click.echo(str(exc), err=True)
        raise SystemExit(1)

    manifest, state = project.manifest, project.state
    meta = manifest.get("meta", {})

    click.echo(f"{meta.get('title', meta.get('id', '?'))}  (v{meta.get('version', '?')})")

    if state is not None and state.get("spec_version") != meta.get("version"):
        click.echo(
            f"  [!] WARNING: state.spec_version '{state.get('spec_version')}' differs from "
            f"manifest.meta.version '{meta.get('version')}' - the spec changed since this build started."
        )

    progress = (state.get("progress") if state else {}) or {}
    flat_steps = graph.flatten_steps(manifest.get("process") or [])

    try:
        ordered = graph.topological_sort(flat_steps)
        rank = {step.id: i for i, step in enumerate(ordered)}
    except graph.CycleError as exc:
        click.echo(f"  [!] WARNING: cycle detected among steps ({', '.join(exc.cycle_ids)}) - showing source order.")
        rank = {step.id: i for i, step in enumerate(flat_steps)}

    visible = _visible_step_ids(manifest, state)

    children: dict[str | None, list[graph.FlatStep]] = {}
    for step in flat_steps:
        children.setdefault(step.parent_id, []).append(step)
    for kids in children.values():
        kids.sort(key=lambda s: rank.get(s.id, 0))

    click.echo("")

    def _print_level(parent_id: str | None, indent: int) -> None:
        for step in children.get(parent_id, []):
            if step.id not in visible:
                continue
            entry = progress.get(step.id) or {}
            marker = STATUS_MARKERS.get(entry.get("status", "todo"), "[ ]")
            suffix = "  (group)" if step.kind == "group" else ""
            click.echo(f"{'    ' * indent}{marker} {step.id}  {step.title}{suffix}")
            _print_level(step.id, indent + 1)

    _print_level(None, 0)

    branches = manifest.get("branches") or []
    branch_choices = (state.get("branch_choices") if state else {}) or {}
    unresolved = [b for b in branches if isinstance(b, dict) and b.get("id") not in branch_choices]
    if unresolved:
        click.echo("")
        click.echo("Branches awaiting a choice (all options shown above):")
        for branch in unresolved:
            click.echo(f"  - {branch.get('id')}: {branch.get('question')}")
            for option in branch.get("options") or []:
                click.echo(f"      [{option.get('value')}] activates: {', '.join(option.get('chosen_step') or [])}")


def main() -> None:
    cli()


if __name__ == "__main__":
    main()
