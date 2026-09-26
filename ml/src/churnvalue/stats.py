"""Descriptive statistics used by the analysis notebooks."""

from __future__ import annotations

import numpy as np
from numpy.typing import ArrayLike
from scipy.stats import mannwhitneyu

# Conventional |delta| bands (Romano et al., 2006).
CLIFF_BANDS = ((0.147, "negligible"), (0.33, "small"), (0.474, "medium"))


def cliffs_delta(x: ArrayLike, y: ArrayLike) -> float:
    """P(X > Y) - P(X < Y), from the Mann-Whitney U: delta = 2U / (n_x n_y) - 1. In [-1, 1]."""
    x_arr = np.asarray(x, dtype=np.float64)
    y_arr = np.asarray(y, dtype=np.float64)
    x_arr, y_arr = x_arr[np.isfinite(x_arr)], y_arr[np.isfinite(y_arr)]
    if x_arr.size == 0 or y_arr.size == 0:
        raise ValueError("both samples need at least one finite value")
    u = mannwhitneyu(x_arr, y_arr, alternative="two-sided").statistic
    return float(2.0 * u / (x_arr.size * y_arr.size) - 1.0)


def cliffs_band(delta: float) -> str:
    magnitude = abs(delta)
    for bound, label in CLIFF_BANDS:
        if magnitude < bound:
            return label
    return "large"
