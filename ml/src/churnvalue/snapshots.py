"""Monthly snapshots: cutoffs, cadence-aware eligibility, churn labels (ADR 0002)."""

from __future__ import annotations

import numpy as np
import pandas as pd

from churnvalue.btyd import (
    DAYS_PER_WEEK,
    FloatArray,
    bgnbd_p_alive,
    fit_bgnbd,
    fit_gamma_gamma,
    gamma_gamma_expected_aov,
)
from churnvalue.config import SnapshotConfig
from churnvalue.features import (
    add_context_features,
    add_derived_features,
    compute_base_features,
)


def make_cutoffs(
    first_date: pd.Timestamp, last_date: pd.Timestamp, horizon_days: int, min_history_months: int
) -> list[pd.Timestamp]:
    """Monthly cutoffs, newest = last_date - horizon so its label window is fully observed."""
    newest = last_date - pd.Timedelta(days=horizon_days)
    earliest = first_date + pd.DateOffset(months=min_history_months)
    cutoffs: list[pd.Timestamp] = []
    k = 0
    # Offsetting from `newest` (not iteratively) avoids day-of-month drift.
    while (cutoff := newest - pd.DateOffset(months=k)) >= earliest:
        cutoffs.append(pd.Timestamp(cutoff))
        k += 1
    return sorted(cutoffs)


def eligible_mask(features: pd.DataFrame, horizon_days: int, f: float) -> pd.Series:
    """Keep customers whose expected next purchase falls in [-f*H, H + f*H] days from cutoff."""
    days_to_expected = features["cadence_days"] - features["recency_days"]
    return (
        (features["n_purchase_days"] >= 2)
        & (days_to_expected >= -f * horizon_days)
        & (days_to_expected <= horizon_days + f * horizon_days)
    )


def churn_labels(
    tx: pd.DataFrame, customer_ids: pd.Index, cutoff: pd.Timestamp, horizon_days: int
) -> pd.Series:
    """1 if the customer has no purchase in (cutoff, cutoff + H], else 0."""
    window_end = cutoff + pd.Timedelta(days=horizon_days)
    future = tx.loc[(~tx["is_return"]) & (tx["date"] > cutoff) & (tx["date"] <= window_end)]
    active = customer_ids.isin(future["customer_id"].unique())
    return pd.Series(np.where(active, 0, 1), index=customer_ids, name="churn", dtype="int64")


def bgnbd_inputs(features: pd.DataFrame) -> tuple[FloatArray, FloatArray, FloatArray]:
    """BG/NBD inputs in weeks: repeat purchase days x, last purchase time t_x, and age T."""
    x = (features["n_purchase_days"] - 1).to_numpy(dtype=np.float64)
    t_x = (features["tenure_days"] - features["recency_days"]).to_numpy(
        dtype=np.float64
    ) / DAYS_PER_WEEK
    big_t = features["tenure_days"].to_numpy(dtype=np.float64) / DAYS_PER_WEEK
    return x, t_x, big_t


def btyd_columns(features: pd.DataFrame) -> pd.DataFrame:
    """Unsupervised BTYD quantities fitted on all customers known at the cutoff (no labels used)."""
    x, t_x, big_t = bgnbd_inputs(features)
    bgnbd = fit_bgnbd(x, t_x, big_t)

    repeaters = features["n_purchase_days"] >= 2
    n = features["n_purchase_days"].to_numpy(dtype=np.float64)
    aov = features["avg_order_value"].to_numpy(dtype=np.float64)
    gg = fit_gamma_gamma(n[repeaters.to_numpy()], aov[repeaters.to_numpy()])
    return pd.DataFrame(
        {
            "p_alive": bgnbd_p_alive(bgnbd, x, t_x, big_t),
            "aov_gg": gamma_gamma_expected_aov(gg, n, aov),
            # constant per cutoff; `export` serves them so the browser can recompute aov_gg
            "gg_p": gg.p,
            "gg_q": gg.q,
            "gg_v": gg.v,
        },
        index=features.index,
    )


def build_snapshot(tx: pd.DataFrame, cutoff: pd.Timestamp, cfg: SnapshotConfig) -> pd.DataFrame:
    base = compute_base_features(tx, cutoff, cfg.horizon_days)
    feats = add_derived_features(base, cfg.horizon_days, cfg.cadence_floor_days)
    feats = add_context_features(feats, cutoff)
    feats = feats.join(btyd_columns(feats))
    feats = feats.loc[eligible_mask(feats, cfg.horizon_days, cfg.eligibility_f)].copy()
    feats["churn"] = churn_labels(tx, feats.index, cutoff, cfg.horizon_days)
    feats.insert(0, "cutoff", cutoff)
    return feats.reset_index()


def build_snapshots(tx: pd.DataFrame, cfg: SnapshotConfig) -> pd.DataFrame:
    cutoffs = make_cutoffs(
        tx["date"].min(), tx["date"].max(), cfg.horizon_days, cfg.min_history_months
    )
    return pd.concat([build_snapshot(tx, c, cfg) for c in cutoffs], ignore_index=True)
