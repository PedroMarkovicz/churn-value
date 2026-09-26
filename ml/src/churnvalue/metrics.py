"""Ranking, calibration, targeting and profit metrics with customer-clustered bootstrap CIs."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike, NDArray
from scipy.stats import beta as beta_dist
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

from churnvalue.economics import CustomerEconomics, EconomicParams

FloatArray = NDArray[np.float64]
Metric = Callable[[FloatArray, FloatArray], float]


def pr_auc(y: FloatArray, score: FloatArray) -> float:
    return float(average_precision_score(y, score))


def roc_auc(y: FloatArray, score: FloatArray) -> float:
    return float(roc_auc_score(y, score))


def brier(y: FloatArray, p: FloatArray) -> float:
    return float(brier_score_loss(y, p))


def lift_at(y: FloatArray, score: FloatArray, fraction: float = 0.1) -> float:
    """Precision in the top-k over the base rate.

    Calibrated scores are heavily tied, so the tie block straddling k contributes its expected
    number of churners (random tie-breaking) instead of an arbitrary row-order slice.
    """
    k = max(1, int(np.ceil(fraction * y.size)))
    kth_score = np.sort(score)[::-1][k - 1]
    above = score > kth_score
    tied = score == kth_score
    from_tie = k - int(above.sum())
    churners = y[above].sum() + from_tie * y[tied].mean()
    return float((churners / k) / y.mean())


METRICS: dict[str, Metric] = {
    "pr_auc": pr_auc,
    "roc_auc": roc_auc,
    "brier": brier,
    "lift_at_10": lift_at,
}


@dataclass(frozen=True)
class Estimate:
    value: float
    ci_low: float
    ci_high: float


def bootstrap_statistic(
    statistic: Callable[[NDArray[np.intp]], float],
    groups: ArrayLike,
    n_boot: int,
    seed: int,
    alpha: float = 0.05,
) -> Estimate:
    """Percentile CI for any statistic of row indices, resampling whole customers.

    The statistic receives row indices, so it can resample any set of aligned arrays
    (labels, scores, per-customer economics). Non-finite results (degenerate resamples) are
    skipped.
    """
    group_arr = np.asarray(groups)
    _, group_idx = np.unique(group_arr, return_inverse=True)
    n_groups = int(group_idx.max()) + 1
    one_row_per_group = n_groups == group_arr.size
    rows_by_group = (
        None if one_row_per_group else [np.flatnonzero(group_idx == g) for g in range(n_groups)]
    )
    first_row = np.empty(n_groups, dtype=np.intp)
    first_row[group_idx[::-1]] = np.arange(group_arr.size)[::-1]
    rng = np.random.default_rng(seed)
    stats: list[float] = []
    for _ in range(n_boot):
        sampled = rng.integers(0, n_groups, n_groups)
        rows = (
            first_row[sampled]
            if rows_by_group is None
            else np.concatenate([rows_by_group[g] for g in sampled])
        )
        value = statistic(rows)
        if np.isfinite(value):
            stats.append(value)
    if not stats:
        raise ValueError("every bootstrap resample was degenerate; cannot form a CI")
    low, high = np.quantile(stats, [alpha / 2, 1 - alpha / 2])
    point = statistic(np.arange(group_arr.size))
    return Estimate(value=float(point), ci_low=float(low), ci_high=float(high))


def bootstrap_ci(
    metric: Metric,
    y: ArrayLike,
    score: ArrayLike,
    groups: ArrayLike,
    n_boot: int,
    seed: int,
    alpha: float = 0.05,
) -> Estimate:
    """Customer-clustered percentile CI for a (y, score) metric; single-class resamples skipped."""
    y_arr = np.asarray(y, dtype=np.float64)
    s_arr = np.asarray(score, dtype=np.float64)

    def statistic(rows: NDArray[np.intp]) -> float:
        if np.unique(y_arr[rows]).size < 2:
            return float("nan")
        return metric(y_arr[rows], s_arr[rows])

    return bootstrap_statistic(statistic, groups, n_boot, seed, alpha)


def expected_maximum_profit(
    y: ArrayLike,
    score: ArrayLike,
    econ: CustomerEconomics,
    params: EconomicParams,
    gamma_alpha: float,
    gamma_beta: float,
    n_gamma: int = 200,
) -> float:
    """EMP (Verbraken et al., 2013) with customer-specific values: E_gamma[max_k profit(top-k)] / n.

    The acceptance rate gamma ~ Beta(alpha, beta); `params.gamma` is ignored here.
    """
    y_arr = np.asarray(y, dtype=np.float64)
    s_arr = np.asarray(score, dtype=np.float64)
    order = np.argsort(-s_arr, kind="stable")
    y_o = y_arr[order]
    benefit_minus_crc = (econ.benefit - econ.crc)[order]
    crc = econ.crc[order]
    # Realized profit of contacting customer i is linear in gamma: gamma*a_i + b_i.
    a = y_o * benefit_minus_crc
    b = -(1.0 - y_o) * crc - params.contact_cost
    cum_a = np.concatenate([[0.0], np.cumsum(a)])
    cum_b = np.concatenate([[0.0], np.cumsum(b)])
    # A threshold can only cut between distinct scores: keep k = 0, every tie-group end, and n.
    s_o = s_arr[order]
    cuts = np.concatenate([[0], np.flatnonzero(s_o[1:] != s_o[:-1]) + 1, [s_o.size]])
    cum_a, cum_b = cum_a[cuts], cum_b[cuts]
    gammas = beta_dist.ppf((np.arange(n_gamma) + 0.5) / n_gamma, gamma_alpha, gamma_beta)
    best = (gammas[:, None] * cum_a[None, :] + cum_b[None, :]).max(axis=1)
    return float(best.mean() / y_arr.size)
