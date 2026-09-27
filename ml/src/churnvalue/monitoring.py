"""Feature drift across snapshots: population stability index (design §5.5)."""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
import pandas as pd
from numpy.typing import ArrayLike

PSI_FLOOR = 1e-4  # empty bins would make the log ratio infinite
# Conventional reading of PSI (Siddiqi, 2006).
PSI_BANDS = ((0.1, "stable"), (0.25, "moderate shift"), (float("inf"), "major shift"))


def psi(reference: ArrayLike, current: ArrayLike, n_bins: int = 10) -> float:
    """Population stability index of ``current`` against bins of ``reference``.

    A feature with at most ``n_bins`` distinct reference values (flags, small counts) gets one
    bin per value plus one for values never seen in the reference. Otherwise the bins are
    reference deciles with open-ended outer bins. Empty bins are floored at ``PSI_FLOOR``.
    """
    ref = np.asarray(reference, dtype=np.float64)
    cur = np.asarray(current, dtype=np.float64)
    values = np.unique(ref)
    if values.size <= n_bins:
        n_slots = values.size + 1  # the last slot collects unseen values
        ref_bin = np.searchsorted(values, ref)
        cur_bin = np.where(np.isin(cur, values), np.searchsorted(values, cur), values.size)
    else:
        inner = np.unique(np.quantile(ref, np.linspace(0, 1, n_bins + 1)[1:-1]))
        n_slots = inner.size + 1
        ref_bin = np.searchsorted(inner, ref, side="right")
        cur_bin = np.searchsorted(inner, cur, side="right")
    r = np.maximum(np.bincount(ref_bin, minlength=n_slots) / ref.size, PSI_FLOOR)
    c = np.maximum(np.bincount(cur_bin, minlength=n_slots) / cur.size, PSI_FLOOR)
    return float(np.sum((c - r) * np.log(c / r)))


def psi_band(value: float) -> str:
    return next(label for limit, label in PSI_BANDS if value < limit)


def drift_table(
    snapshots: pd.DataFrame,
    reference_cutoffs: Sequence[pd.Timestamp],
    features: Sequence[str],
) -> pd.DataFrame:
    """PSI of every feature at every cutoff against the pooled reference (training) cutoffs."""
    reference = snapshots.loc[snapshots["cutoff"].isin(reference_cutoffs)]
    rows = []
    for cutoff, frame in snapshots.groupby("cutoff", sort=True):
        for feature in features:
            rows.append(
                {
                    "cutoff": pd.Timestamp(cutoff),  # type: ignore[arg-type]
                    "feature": feature,
                    "psi": psi(reference[feature], frame[feature]),
                }
            )
    return pd.DataFrame(rows)
