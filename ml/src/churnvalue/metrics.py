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
    k = max(1, int(np.ceil(fraction * y.size)))
    top = np.argsort(-score, kind="stable")[:k]
    return float(y[top].mean() / y.mean())


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


def bootstrap_ci(
    metric: Metric,
    y: ArrayLike,
    score: ArrayLike,
    groups: ArrayLike,
    n_boot: int,
    seed: int,
    alpha: float = 0.05,
) -> Estimate:
    """Percentile CI resampling whole customers (rows of one customer move together)."""
    y_arr = np.asarray(y, dtype=np.float64)
    s_arr = np.asarray(score, dtype=np.float64)
    _, group_idx = np.unique(np.asarray(groups), return_inverse=True)
    n_groups = int(group_idx.max()) + 1
    rows_by_group = [np.flatnonzero(group_idx == g) for g in range(n_groups)]
    one_row_per_group = n_groups == y_arr.size
    rng = np.random.default_rng(seed)
    stats: list[float] = []
    for _ in range(n_boot):
        sampled = rng.integers(0, n_groups, n_groups)
        rows = (
            np.concatenate([rows_by_group[g] for g in sampled])
            if not one_row_per_group
            else np.array([rows_by_group[g][0] for g in sampled])
        )
        if np.unique(y_arr[rows]).size < 2:
            continue
        stats.append(metric(y_arr[rows], s_arr[rows]))
    low, high = np.quantile(stats, [alpha / 2, 1 - alpha / 2])
    return Estimate(value=metric(y_arr, s_arr), ci_low=float(low), ci_high=float(high))


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
    order = np.argsort(-np.asarray(score, dtype=np.float64), kind="stable")
    y_o = y_arr[order]
    benefit_minus_crc = (econ.benefit - econ.crc)[order]
    crc = econ.crc[order]
    # Realized profit of contacting customer i is linear in gamma: gamma*a_i + b_i.
    a = y_o * benefit_minus_crc
    b = -(1.0 - y_o) * crc - params.contact_cost
    cum_a = np.concatenate([[0.0], np.cumsum(a)])
    cum_b = np.concatenate([[0.0], np.cumsum(b)])
    gammas = beta_dist.ppf((np.arange(n_gamma) + 0.5) / n_gamma, gamma_alpha, gamma_beta)
    best = (gammas[:, None] * cum_a[None, :] + cum_b[None, :]).max(axis=1)
    return float(best.mean() / y_arr.size)
