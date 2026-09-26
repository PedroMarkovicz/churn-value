"""Execute the analysis notebooks in place and export styled HTML (design §6.7)."""

from __future__ import annotations

import asyncio
import hashlib
import sys
from pathlib import Path

import nbformat
from nbclient import NotebookClient
from nbconvert import HTMLExporter

NOTEBOOKS_DIR = Path("notebooks")
HTML_DIR = Path("reports/notebooks")
METADATA_KEY = "churnvalue"  # notebook metadata namespace for the freshness digest


def discover(notebooks_dir: Path, only: list[str] | None = None) -> list[Path]:
    """Numbered notebooks (``NN_name.ipynb``) in order; ``only`` filters by the NN prefix."""
    paths = sorted(p for p in notebooks_dir.glob("[0-9][0-9]_*.ipynb"))
    if only:
        paths = [p for p in paths if p.name[:2] in set(only)]
    return paths


def execute_notebook(path: Path, working_dir: Path, timeout: int = 1800) -> None:
    """Run every cell top to bottom with ``working_dir`` as the kernel's cwd; save outputs.

    Raises ``nbclient.exceptions.CellExecutionError`` on the first failing cell, before anything
    is written. On success the notebook records a digest of its sources (see
    ``executed_in_order``).
    """
    if sys.platform == "win32":  # zmq needs a selector loop; the default Proactor loop warns
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    notebook = nbformat.read(path, as_version=4)
    client = NotebookClient(
        notebook,
        timeout=timeout,
        kernel_name="python3",
        resources={"metadata": {"path": str(working_dir)}},
        record_timing=False,  # timestamps would make every re-run differ in git
    )
    client.execute()
    notebook.metadata[METADATA_KEY] = {"source_sha256": source_digest(notebook)}
    nbformat.write(notebook, path)


def export_html(path: Path, html_dir: Path) -> Path:
    """Export an executed notebook to HTML with the lab template (keeps inline styles)."""
    html_dir.mkdir(parents=True, exist_ok=True)
    body, _ = HTMLExporter(template_name="lab").from_filename(str(path))
    out = html_dir / f"{path.stem}.html"
    out.write_text(body, encoding="utf-8")
    return out


def source_digest(notebook: nbformat.NotebookNode) -> str:
    """SHA-256 of every cell's type and source (code and markdown), in order."""
    digest = hashlib.sha256()
    for cell in notebook.cells:
        digest.update(cell.cell_type.encode())
        digest.update(b"\n")
        digest.update(cell.source.encode())
        digest.update(b"\n")
    return digest.hexdigest()


def executed_in_order(path: Path) -> bool:
    """True if the saved outputs come from one top-to-bottom run of the current sources.

    Checks that code cells ran 1, 2, 3, … in a fresh kernel and that no cell (code or markdown)
    was edited after that run, via the digest ``execute_notebook`` stores in the metadata.
    """
    notebook = nbformat.read(path, as_version=4)
    counts = [c.get("execution_count") for c in notebook.cells if c.cell_type == "code"]
    recorded = notebook.metadata.get(METADATA_KEY, {}).get("source_sha256")
    return counts == list(range(1, len(counts) + 1)) and recorded == source_digest(notebook)
