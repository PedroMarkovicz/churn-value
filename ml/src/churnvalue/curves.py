"""Evaluation curves on fixed grids, small enough to ship to the browser as JSON."""

from __future__ import annotations

import numpy as np
from numpy.typing import ArrayLike, NDArray
from sklearn.metrics import precision_recall_curve, roc_curve

FloatArray = NDArray[np.float64]
GRID_POINTS = 101


def _grid(n_points: int) -> FloatArray:
    return np.linspace(0.0, 1.0, n_points)


def _rounded(values: ArrayLike) -> list[float]:
    return [round(float(v), 6) for v in np.asarray(values, dtype=np.float64)]


def pr_points(
    y: ArrayLike, score: ArrayLike, n_points: int = GRID_POINTS
) -> dict[str, list[float]]:
    """Interpolated precision (best precision at recall >= r) on a recall grid."""
    precision, recall, _ = precision_recall_curve(np.asarray(y), np.asarray(score))
    order = np.argsort(recall, kind="stable")
    recall, precision = recall[order], precision[order]
    envelope = np.maximum.accumulate(precision[::-1])[::-1]  # best precision to the right
    grid = _grid(n_points)
    idx = np.clip(np.searchsorted(recall, grid, side="left"), 0, recall.size - 1)
    return {"recall": _rounded(grid), "precision": _rounded(envelope[idx])}


def roc_points(
    y: ArrayLike, score: ArrayLike, n_points: int = GRID_POINTS
) -> dict[str, list[float]]:
    """True-positive rate on a false-positive-rate grid (linear between ROC vertices)."""
    fpr, tpr, _ = roc_curve(np.asarray(y), np.asarray(score))
    # A vertical ROC segment repeats an FPR; keep its highest TPR so interpolation is defined.
    starts = np.flatnonzero(np.r_[True, np.diff(fpr) > 0])
    grid = _grid(n_points)
    tpr_at = np.interp(grid, fpr[starts], np.maximum.reduceat(tpr, starts))
    return {"fpr": _rounded(grid), "tpr": _rounded(tpr_at)}


def gains_points(
    y: ArrayLike, score: ArrayLike, n_points: int = GRID_POINTS
) -> dict[str, list[float]]:
    """Share of churners captured when contacting the top fraction, ties split at random."""
    y_arr = np.asarray(y, dtype=np.float64)
    s_arr = np.asarray(score, dtype=np.float64)
    order = np.argsort(-s_arr, kind="stable")
    s_o, y_o = s_arr[order], y_arr[order]
    ends = np.concatenate([np.flatnonzero(s_o[1:] != s_o[:-1]) + 1, [s_o.size]])
    fraction = np.concatenate([[0.0], ends / s_o.size])
    captured = np.concatenate([[0.0], np.cumsum(y_o)[ends - 1] / y_o.sum()])
    grid = _grid(n_points)
    # Linear inside a tie block = the expected capture under random tie-breaking.
    return {"fraction": _rounded(grid), "captured": _rounded(np.interp(grid, fraction, captured))}


def reliability_bins(y: ArrayLike, p: ArrayLike, n_bins: int = 10) -> list[dict[str, float]]:
    """Equal-width probability bins: mean predicted p, observed churn rate and count (non-empty)."""
    y_arr = np.asarray(y, dtype=np.float64)
    p_arr = np.asarray(p, dtype=np.float64)
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    which = np.clip(np.digitize(p_arr, edges[1:-1], right=False), 0, n_bins - 1)
    out = []
    for b in range(n_bins):
        in_bin = which == b
        if in_bin.any():
            out.append(
                {
                    "bin_low": round(float(edges[b]), 6),
                    "bin_high": round(float(edges[b + 1]), 6),
                    "mean_p": round(float(p_arr[in_bin].mean()), 6),
                    "churn_rate": round(float(y_arr[in_bin].mean()), 6),
                    "n": int(in_bin.sum()),
                }
            )
    return out
