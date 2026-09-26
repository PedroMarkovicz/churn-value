"""The committed notebooks must be the output of one clean, top-to-bottom run."""

from pathlib import Path

import nbformat
import pytest

from churnvalue.notebooks import discover, executed_in_order

NOTEBOOKS = Path(__file__).parents[1] / "notebooks"
COMMITTED = discover(NOTEBOOKS)


def test_the_six_stage_notebooks_exist():
    assert [p.name[:2] for p in COMMITTED][:6] == ["01", "02", "03", "04", "05", "06"]


@pytest.mark.parametrize("path", COMMITTED, ids=lambda p: p.name)
def test_notebook_was_executed_top_to_bottom_without_errors(path: Path):
    assert executed_in_order(path), "re-run with `churnvalue notebooks` before committing"
    notebook = nbformat.read(path, as_version=4)
    errors = [
        output
        for cell in notebook.cells
        if cell.cell_type == "code"
        for output in cell.get("outputs", [])
        if output.get("output_type") == "error"
    ]
    assert not errors
