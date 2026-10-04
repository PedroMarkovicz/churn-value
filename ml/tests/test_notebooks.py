from pathlib import Path

import nbformat
import pytest
from nbclient.exceptions import CellExecutionError

from churnvalue.notebooks import (
    NotebookEntry,
    build_site,
    discover,
    execute_notebook,
    executed_in_order,
    export_html,
    index_page,
    site_page,
)


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


ENTRIES = (
    NotebookEntry("01_first", "First & <foremost>", "Does it work?"),
    NotebookEntry("02_second", "Second", "And then?"),
)


def executed(path: Path, *sources: str) -> Path:
    write_notebook(path, *sources)
    execute_notebook(path, working_dir=path.parent)
    return path


def test_site_page_sets_a_readable_title_and_adds_the_top_bar(tmp_path: Path):
    nb = nbformat.v4.new_notebook()
    nb.cells = [nbformat.v4.new_markdown_cell("notebook-body-marker")]
    nbformat.write(nb, tmp_path / "01_first.ipynb")
    exported = export_html(tmp_path / "01_first.ipynb", tmp_path / "html")

    page = site_page(exported.read_text(encoding="utf-8"), ENTRIES[0])

    assert "<title>01 · First &amp; &lt;foremost&gt; — churn-value notebooks</title>" in page
    assert "<title>01_first</title>" not in page
    bar = page.index('<nav class="cv-bar"')
    assert page.index("<body") < bar < page.index("notebook-body-marker")
    assert 'href="index.html"' in page
    assert 'href="/"' in page
    assert page.index(".cv-bar{") < page.index("</head>")


def test_site_page_refuses_html_it_cannot_place_the_title_or_bar_in():
    with pytest.raises(ValueError, match="01_first"):
        site_page("<html><body></body></html>", ENTRIES[0])


def test_index_page_lists_the_notebooks_in_order_with_their_questions():
    page = index_page(ENTRIES)
    assert "<title>Notebooks — churn-value</title>" in page
    assert page.index('href="01_first.html"') < page.index('href="02_second.html"')
    assert "First &amp; &lt;foremost&gt;" in page
    assert "<foremost>" not in page
    assert "Does it work?" in page
    assert "And then?" in page
    assert 'href="/"' in page


def test_build_site_writes_a_page_per_notebook_and_the_index(tmp_path: Path):
    source = tmp_path / "notebooks"
    source.mkdir()
    executed(source / "01_first.ipynb", "x = 1")
    executed(source / "02_second.ipynb", "print('two')")
    out = tmp_path / "site"
    out.mkdir()
    (out / "09_removed.html").write_text("old", encoding="utf-8")  # left by an earlier build

    written = build_site(source, out, ENTRIES)

    expected = ["01_first.html", "02_second.html", "index.html"]
    assert [path.name for path in written] == expected
    assert sorted(path.name for path in out.iterdir()) == expected
    second = (out / "02_second.html").read_text(encoding="utf-8")
    assert "<title>02 · Second — churn-value notebooks</title>" in second
    assert '<nav class="cv-bar"' in second


def test_build_site_refuses_a_notebook_that_is_not_a_clean_run(tmp_path: Path):
    source = tmp_path / "notebooks"
    source.mkdir()
    executed(source / "01_first.ipynb", "x = 1")
    write_notebook(source / "02_second.ipynb", "x = 2")  # never executed
    out = tmp_path / "site"

    with pytest.raises(ValueError, match="02_second.ipynb"):
        build_site(source, out, ENTRIES)

    assert not out.exists()  # nothing was written


def test_build_site_refuses_when_the_catalogue_and_the_notebooks_differ(tmp_path: Path):
    source = tmp_path / "notebooks"
    source.mkdir()
    executed(source / "01_first.ipynb", "x = 1")

    with pytest.raises(ValueError, match="differ"):
        build_site(source, tmp_path / "site", ENTRIES)
