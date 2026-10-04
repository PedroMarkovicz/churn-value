"""Execute the analysis notebooks in place and export styled HTML (design §6.7)."""

from __future__ import annotations

import asyncio
import hashlib
import html
import re
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

import nbformat
from nbclient import NotebookClient
from nbconvert import HTMLExporter

NOTEBOOKS_DIR = Path("notebooks")
HTML_DIR = Path("reports/notebooks")
METADATA_KEY = "churnvalue"  # notebook metadata namespace for the freshness digest
SITE_NAME = "churn-value"


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


@dataclass(frozen=True)
class NotebookEntry:
    """One published notebook: its file stem, its title and the question it answers."""

    stem: str
    title: str
    question: str

    @property
    def number(self) -> str:
        return self.stem[:2]


# The published notebooks, in order (design §6.7). ``build_site`` refuses to run when this list
# and the numbered notebooks on disk differ.
CATALOGUE: tuple[NotebookEntry, ...] = (
    NotebookEntry(
        "01_data_ingestion",
        "Data ingestion",
        "Where does the data come from, and can we trust our copy?",
    ),
    NotebookEntry("02_data_cleaning", "Data cleaning", "Which rows do we drop, and why?"),
    NotebookEntry("03_eda", "Exploratory analysis", "How do these customers buy?"),
    NotebookEntry(
        "04_problem_framing",
        "Problem framing",
        'How does "stopped buying" become a label we can learn and trust?',
    ),
    NotebookEntry(
        "05_feature_engineering",
        "Feature engineering",
        "What do we know about a customer at the cutoff, and nothing more?",
    ),
    NotebookEntry(
        "06_baselines",
        "Baselines",
        "How far do customer-base models get, and what does trusting them cost?",
    ),
    NotebookEntry(
        "07_model_training",
        "Model training",
        "Which supervised models, tuned how, under temporal CV?",
    ),
    NotebookEntry(
        "08_evaluation",
        "Evaluation",
        "How good are the models, with CIs, and does calibration survive the season?",
    ),
    NotebookEntry(
        "09_explainability", "Explainability", "Why does the model flag a given customer?"
    ),
    NotebookEntry(
        "10_business_value",
        "Business value",
        "What is the model worth in money, and under which assumptions?",
    ),
    NotebookEntry(
        "11_ablation",
        "Ablation",
        "What do the context features buy, and which calibration fixes failed?",
    ),
)

BAR_STYLE = """<style>
.cv-bar{display:flex;justify-content:space-between;gap:16px;padding:10px 20px;
  border-bottom:1px solid #e3e1ee;background:#fff;
  font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
.cv-bar a{color:#4A3AA7;text-decoration:none}
.cv-bar a:hover,.cv-bar a:focus{text-decoration:underline}
</style>"""
BAR = (
    '<nav class="cv-bar" aria-label="Notebooks">'
    '<a href="index.html">\u2190 All notebooks</a>'
    f'<a href="/">{SITE_NAME}</a>'
    "</nav>"
)
INDEX_STYLE = """<style>
:root{color-scheme:light}
body{margin:0;background:#f7f6fb;color:#1c1b29;
  font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:32px 20px 64px}
a{color:#4A3AA7}
h1{font-size:28px;line-height:1.2;margin:24px 0 8px}
.lede{margin:0 0 24px;color:#4b4a5c}
ol{list-style:none;margin:0;padding:0;display:grid;gap:10px}
li{background:#fff;border:1px solid #e3e1ee;border-left:6px solid #4A3AA7;border-radius:8px;
  padding:14px 18px}
li a{display:flex;gap:12px;font-weight:600;text-decoration:none}
li a:hover .t,li a:focus .t{text-decoration:underline}
.n{font-variant-numeric:tabular-nums;color:#6b6980}
li p{margin:4px 0 0;color:#4b4a5c}
</style>"""
_TITLE = re.compile(r"<title>.*?</title>", re.DOTALL)
_BODY = re.compile(r"<body\b[^>]*>")
_HEAD_END = "</head>"


def page_title(entry: NotebookEntry) -> str:
    return f"{entry.number} \u00b7 {entry.title} \u2014 {SITE_NAME} notebooks"


def site_page(page: str, entry: NotebookEntry) -> str:
    """An exported notebook as a page of the site: a readable title and a bar back to the index.

    Raises ``ValueError`` if the HTML has no ``<title>``, ``<body>`` or ``</head>`` to anchor on.
    """
    title = f"<title>{html.escape(page_title(entry))}</title>"
    page, titles = _TITLE.subn(lambda _: title, page, count=1)
    page, bodies = _BODY.subn(lambda match: f"{match.group(0)}\n{BAR}", page, count=1)
    if titles != 1 or bodies != 1 or _HEAD_END not in page:
        raise ValueError(f"{entry.stem}: the exported HTML has no <title>, <body> or </head>")
    return page.replace(_HEAD_END, f"{BAR_STYLE}\n{_HEAD_END}", 1)


def index_page(entries: Sequence[NotebookEntry]) -> str:
    """The notebooks' index: each one with its number, its title and the question it answers."""
    items = "\n".join(
        f'        <li><a href="{html.escape(entry.stem)}.html">'
        f'<span class="n">{entry.number}</span>'
        f'<span class="t">{html.escape(entry.title)}</span></a>'
        f"<p>{html.escape(entry.question)}</p></li>"
        for entry in entries
    )
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Notebooks \u2014 {SITE_NAME}</title>
{INDEX_STYLE}
  </head>
  <body>
    <main>
      <p><a href="/">\u2190 {SITE_NAME}</a></p>
      <h1>The analysis notebooks</h1>
      <p class="lede">The reasoning behind the site, stage by stage. Each notebook reads the
        pipeline's outputs; none of them is part of the pipeline.</p>
      <ol>
{items}
      </ol>
    </main>
  </body>
</html>
"""


def build_site(
    notebooks_dir: Path, out_dir: Path, catalogue: Sequence[NotebookEntry] = CATALOGUE
) -> list[Path]:
    """Write one HTML page per notebook and ``index.html`` into ``out_dir``, without executing.

    Raises ``ValueError`` before writing anything if the catalogue and the numbered notebooks on
    disk differ, or if a notebook is not the output of one clean run of its current sources.
    Notebook pages (``NN_*.html``) left in ``out_dir`` by an earlier build are removed, so a
    renamed notebook is never published twice; no other file there is touched.
    """
    paths = discover(notebooks_dir)
    found = [path.stem for path in paths]
    expected = [entry.stem for entry in catalogue]
    if found != expected:
        raise ValueError(
            f"the catalogue and the notebooks on disk differ: catalogue {expected}, on disk {found}"
        )
    stale = [path.name for path in paths if not executed_in_order(path)]
    if stale:
        raise ValueError(f"not executed top to bottom, or edited after the run: {', '.join(stale)}")
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("[0-9][0-9]_*.html"):
        old.unlink()
    written: list[Path] = []
    for path, entry in zip(paths, catalogue, strict=True):
        page = export_html(path, out_dir)
        text = site_page(page.read_text(encoding="utf-8"), entry)
        page.write_text(text, encoding="utf-8", newline="\n")
        written.append(page)
    index = out_dir / "index.html"
    index.write_text(index_page(catalogue), encoding="utf-8", newline="\n")
    return [*written, index]
