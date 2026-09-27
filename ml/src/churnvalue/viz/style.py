"""Palette and plotting conventions shared by every churn-value notebook (design §6.7).

Colour has one meaning across the whole project:

- ``ACCENT`` (indigo) is chrome only: headers, chips, callouts, never a data series;
- ``CHURN`` is the emphasis, the class we want to find; ``RETAINED`` is grey context;
- ``NEUTRAL`` draws single-series magnitude (counts, revenue) that is not class-coded;
- ``MODEL_COLORS`` is a fixed categorical order for the model ladder, validated for
  colour-vision deficiency with the dataviz validator. Several slots sit below 3:1 contrast,
  so model curves are always direct-labelled;
- ``SEQUENTIAL`` is a one-hue ramp for magnitude (heatmaps); ``DIVERGING`` is blue (gain)
  to red (loss) through a grey midpoint, for profit only, never on a chart with ``CHURN``.

Chart rules: titles state the finding, a source line sits under every figure, sample sizes
are always shown, bars are sorted, and there are no pies, no dual axes, no 3D.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import matplotlib as mpl
import matplotlib.dates as mdates
from cycler import cycler
from matplotlib.axes import Axes
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.figure import Figure
from matplotlib.ticker import FuncFormatter

ACCENT = "#4A3AA7"
CHURN = "#E34948"
RETAINED = "#9AA1AD"
NEUTRAL = "#3B5B8C"
INK = "#2B2F36"
MUTED = "#8A94A3"
GRID = "#E6E8EC"
SURFACE = "#FFFFFF"

MODEL_ORDER = ["cadence_rule", "bgnbd", "logreg", "lightgbm", "lightgbm_seasonal"]
MODEL_COLORS = dict(
    zip(MODEL_ORDER, ["#2A78D6", "#EB6834", "#1BAF7A", "#EDA100", "#E87BA4"], strict=True)
)
ORACLE_COLOR = INK
MODEL_LABELS = {
    "cadence_rule": "cadence rule",
    "bgnbd": "BG/NBD",
    "logreg": "logistic regression",
    "lightgbm": "LightGBM",
    "lightgbm_seasonal": "LightGBM + season",
}

SEQUENTIAL = LinearSegmentedColormap.from_list(
    "churnvalue_sequential", ["#EEF4FC", "#9EC5F4", "#3987E5", "#1C5CAB", "#0D366B"]
)
DIVERGING = LinearSegmentedColormap.from_list(
    "churnvalue_diverging", ["#B8322F", "#E34948", "#F0EFEC", "#2A78D6", "#184F95"]
)

SOURCE = "Source: UCI Online Retail II (Chen, 2012) · CC BY 4.0 · churn-value"


def apply_style() -> None:
    """Quiet, publication-oriented defaults: hairline grid, no top/right spines, left titles."""
    mpl.rcParams.update(
        {
            "figure.dpi": 110,
            "figure.facecolor": SURFACE,
            "savefig.dpi": 150,
            "savefig.bbox": "tight",
            "savefig.facecolor": SURFACE,
            "font.family": "sans-serif",
            "font.sans-serif": ["Inter", "Source Sans 3", "Segoe UI", "DejaVu Sans"],
            "font.size": 10,
            "axes.titlesize": 11,
            "axes.titleweight": "bold",
            "axes.titlelocation": "left",
            "axes.titlepad": 10,
            "axes.labelsize": 9.5,
            "axes.labelcolor": INK,
            "axes.edgecolor": MUTED,
            "axes.linewidth": 0.8,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "axes.grid": True,
            "axes.axisbelow": True,
            "axes.facecolor": SURFACE,
            "axes.prop_cycle": cycler(color=[NEUTRAL]),
            "grid.color": GRID,
            "grid.linewidth": 0.6,
            "xtick.color": INK,
            "ytick.color": INK,
            "xtick.labelsize": 8.5,
            "ytick.labelsize": 8.5,
            "legend.frameon": False,
            "legend.fontsize": 8.5,
            "lines.linewidth": 2.0,
            "text.color": INK,
        }
    )


def headline(fig: Figure, title: str, subtitle: str | None = None) -> None:
    """Figure-level title stating the finding, anchored a fixed number of points above the axes.

    Offsets are in points (not figure fractions) so short and tall figures look the same.
    """
    top = max((ax.get_position().y1 for ax in fig.axes), default=0.9)
    height_pt = fig.get_size_inches()[1] * 72
    has_panel_titles = any(ax.get_title(loc="left") or ax.get_title() for ax in fig.axes)
    y = top + (28 if has_panel_titles else 12) / height_pt
    if subtitle:
        fig.text(
            0.0,
            y,
            subtitle,
            fontsize=9.5,
            color=MUTED,
            ha="left",
            va="bottom",
            transform=fig.transFigure,
        )
        y += 17 / height_pt
    fig.text(
        0.0,
        y,
        title,
        fontsize=13.5,
        fontweight="bold",
        color=INK,
        ha="left",
        va="bottom",
        transform=fig.transFigure,
    )


def add_source(fig: Figure, note: str | None = None, y: float = -0.02) -> None:
    """Source line under the figure; ``note`` is prepended. Lower ``y`` below external legends."""
    text = SOURCE if note is None else f"{note}   ·   {SOURCE}"
    fig.text(
        0.0, y, text, fontsize=7.5, color=MUTED, ha="left", va="top", transform=fig.transFigure
    )


def date_axis(ax: Axes, months: tuple[int, ...] = (1, 4, 7, 10)) -> None:
    """Readable date ticks: one per quarter, 'Jan\n2011' at year starts and 'Apr' otherwise."""
    ax.xaxis.set_major_locator(mdates.MonthLocator(bymonth=months))
    ax.xaxis.set_major_formatter(
        FuncFormatter(
            lambda v, _: mdates.num2date(v).strftime(
                "%b\n%Y" if mdates.num2date(v).month == 1 else "%b"
            )
        )
    )


def annotate_counts(ax: Axes, positions, counts, y: float = 0.98, fontsize: float = 7.5) -> None:
    """Write ``n = …`` above each group (sample size is never hidden). ``y`` is in axes units."""
    for x, n in zip(positions, counts, strict=True):
        ax.text(
            x,
            y,
            f"n = {n:,}",
            ha="center",
            va="top",
            fontsize=fontsize,
            color=MUTED,
            transform=ax.get_xaxis_transform(),
        )


def spread_positions(values: dict[str, float], min_gap: float) -> dict[str, float]:
    """Label y-positions near ``values`` but at least ``min_gap`` apart, order preserved."""
    ordered = sorted(values.items(), key=lambda item: item[1])
    placed: list[float] = []
    for _, value in ordered:
        placed.append(value if not placed else max(value, placed[-1] + min_gap))
    # Centre the block on the data so labels move as little as possible.
    shift = (sum(v for _, v in ordered) - sum(placed)) / len(placed) if placed else 0.0
    return {name: y + shift for (name, _), y in zip(ordered, placed, strict=True)}


def direct_labels(
    ax: Axes,
    x: Any,  # a number or a date, in data coordinates
    values: dict[str, float],
    labels: dict[str, str],
    min_gap: float,
    fontsize: float = 8.0,
) -> None:
    """Label line ends at ``x`` in ink (never the series colour), nudged apart vertically."""
    for key, y in spread_positions(values, min_gap).items():
        ax.text(x, y, f" {labels[key]}", va="center", ha="left", fontsize=fontsize, color=INK)


def gbp(value: float, decimals: int = 0) -> str:
    """Compact pound formatting: £950, £12.3k, £1.25m (sign kept)."""
    sign = "−" if value < 0 else ""
    v = abs(value)
    if v >= 1e6:
        return f"{sign}£{v / 1e6:.2f}m"
    if v >= 1e4:
        return f"{sign}£{v / 1e3:.1f}k"
    return f"{sign}£{v:,.{decimals}f}"


def save_fig(fig: Figure, figures_dir: str | Path, stage: str, name: str) -> Path:
    """Save ``<stage>_<name>.png`` under ``figures_dir`` and return its path."""
    figures_dir = Path(figures_dir)
    figures_dir.mkdir(parents=True, exist_ok=True)
    path = figures_dir / f"{stage}_{name}.png"
    fig.savefig(path)
    return path
