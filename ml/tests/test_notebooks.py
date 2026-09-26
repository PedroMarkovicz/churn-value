from pathlib import Path

import nbformat
import pytest
from nbclient.exceptions import CellExecutionError

from churnvalue.notebooks import discover, execute_notebook, executed_in_order, export_html


def write_notebook(path: Path, *sources: str) -> Path:
    nb = nbformat.v4.new_notebook()
    nb.cells = [nbformat.v4.new_markdown_cell("# Title")] + [
        nbformat.v4.new_code_cell(s) for s in sources
    ]
    nbformat.write(nb, path)
    return path


def test_discover_orders_and_filters_numbered_notebooks(tmp_path: Path):
    for name in ["02_b.ipynb", "01_a.ipynb", "scratch.ipynb", "10_c.ipynb"]:
        write_notebook(tmp_path / name)
    assert [p.name for p in discover(tmp_path)] == ["01_a.ipynb", "02_b.ipynb", "10_c.ipynb"]
    assert [p.name for p in discover(tmp_path, ["02"])] == ["02_b.ipynb"]


def test_execute_runs_in_working_dir_and_saves_outputs(tmp_path: Path):
    work = tmp_path / "project"
    work.mkdir()
    (work / "marker.txt").write_text("hello", encoding="utf-8")
    nb_path = write_notebook(
        tmp_path / "01_demo.ipynb",
        "from pathlib import Path",
        "print(Path('marker.txt').read_text())",
    )
    assert not executed_in_order(nb_path)
    execute_notebook(nb_path, working_dir=work)
    nb = nbformat.read(nb_path, as_version=4)
    assert nb.cells[2].outputs[0]["text"].strip() == "hello"
    assert executed_in_order(nb_path)


def test_execute_fails_loudly_on_a_broken_cell(tmp_path: Path):
    nb_path = write_notebook(tmp_path / "01_bad.ipynb", "raise ValueError('boom')")
    with pytest.raises(CellExecutionError, match="boom"):
        execute_notebook(nb_path, working_dir=tmp_path)


def test_export_html_keeps_inline_styles(tmp_path: Path):
    nb = nbformat.v4.new_notebook()
    nb.cells = [nbformat.v4.new_markdown_cell('<div style="color:#4A3AA7">Header</div>')]
    nb_path = tmp_path / "01_style.ipynb"
    nbformat.write(nb, nb_path)
    out = export_html(nb_path, tmp_path / "html")
    assert out.name == "01_style.html"
    assert "color:#4A3AA7" in out.read_text(encoding="utf-8")


def test_editing_a_cell_after_execution_makes_the_notebook_stale(tmp_path: Path):
    nb_path = write_notebook(tmp_path / "01_demo.ipynb", "x = 1", "print(x)")
    execute_notebook(nb_path, working_dir=tmp_path)
    assert executed_in_order(nb_path)
    nb = nbformat.read(nb_path, as_version=4)
    nb.cells[1].source = "raise RuntimeError('edited, never run')"
    nbformat.write(nb, nb_path)
    assert not executed_in_order(nb_path)


def test_editing_markdown_after_execution_makes_the_notebook_stale(tmp_path: Path):
    nb_path = write_notebook(tmp_path / "01_demo.ipynb", "x = 1")
    execute_notebook(nb_path, working_dir=tmp_path)
    nb = nbformat.read(nb_path, as_version=4)
    nb.cells[0].source = "# A different claim"
    nbformat.write(nb, nb_path)
    assert not executed_in_order(nb_path)


def test_execution_records_no_timing_metadata(tmp_path: Path):
    nb_path = write_notebook(tmp_path / "01_demo.ipynb", "x = 1")
    execute_notebook(nb_path, working_dir=tmp_path)
    nb = nbformat.read(nb_path, as_version=4)
    assert all("execution" not in cell.metadata for cell in nb.cells)
