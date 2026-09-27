"""Evaluate calibrated scorers: test metrics with CIs, EMP, curves, policy profits, stability."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import asdict, dataclass
from typing import Any

import numpy as np
import pandas as pd
from numpy.typing import ArrayLike, NDArray

from churnvalue.calibration import Calibrator, select_calibrator
from churnvalue.config import Config
from churnvalue.curves import gains_points, pr_points, reliability_bins, roc_points
from churnvalue.economics import (
    CustomerEconomics,
    EconomicParams,
    customer_economics,
    expected_profit,
    realized_profit,
    select_unconstrained,
    value_at_risk,
)
from churnvalue.metrics import (
    METRICS,
    bootstrap_ci,
    bootstrap_statistic,
    brier,
    expected_maximum_profit,
    pr_auc,
    roc_auc,
)
from churnvalue.models import CUSTOMER_FEATURES, ModelSpec, predict_churn
from churnvalue.monitoring import drift_table
from churnvalue.splits import TemporalSplit, make_temporal_split

FloatArray = NDArray[np.float64]
Scorer = Callable[[pd.DataFrame], FloatArray]  # snapshot rows -> churn score (higher = churn)

BASELINE_SCORERS: dict[str, Scorer] = {
    "cadence_rule": lambda snap: snap["overdue_ratio"].to_numpy(dtype=np.float64),
    "bgnbd": lambda snap: 1.0 - snap["p_alive"].to_numpy(dtype=np.float64),
}


@dataclass(frozen=True)
class CalibratedScorer:
    scorer: Scorer
    calibrator: Calibrator

    def predict(self, frame: pd.DataFrame) -> FloatArray:
        return self.calibrator.transform(self.scorer(frame))


def supervised_scorer(estimator: Any, spec: ModelSpec) -> Scorer:
    return lambda frame: predict_churn(estimator, frame, spec)


def temporal_split(snapshots: pd.DataFrame, cfg: Config) -> TemporalSplit:
    cutoffs = sorted(pd.to_datetime(snapshots["cutoff"].unique()))
    return make_temporal_split(
        cutoffs, cfg.snapshots.horizon_days, cfg.splits.calibration_offset_months
    )


def calibrate_scorers(
    scorers: dict[str, Scorer], calibration: pd.DataFrame, seed: int
) -> dict[str, CalibratedScorer]:
    """Fit each scorer's calibrator (isotonic or Platt, by CV Brier) on the calibration cutoff."""
    y = calibration["churn"].to_numpy(dtype=np.float64)
    return {
        name: CalibratedScorer(scorer, select_calibrator(scorer(calibration), y, seed=seed))
        for name, scorer in scorers.items()
    }


def frame_economics(frame: pd.DataFrame, params: EconomicParams) -> CustomerEconomics:
    return customer_economics(value_at_risk(frame["aov_gg"], frame["cadence_days"], params), params)


def policy_table(
    y: FloatArray,
    probabilities: dict[str, FloatArray],
    econ: CustomerEconomics,
    params: EconomicParams,
    groups: ArrayLike | None = None,
    n_boot: int = 0,
    seed: int = 0,
) -> list[dict[str, Any]]:
    """Realized backtest profit per policy; random = analytic expectation at equal k.

    Undefined quantities are None (never NaN) so the report stays strict JSON. With
    `n_boot > 0`, realized profit gets a customer-clustered bootstrap CI.
    """
    contribution = realized_profit(y, econ, params)
    oracle_mask = (y == 1) & (contribution > 0)
    oracle_profit = float(contribution[oracle_mask].sum())
    mean_contribution = float(contribution.mean())

    def row(name: str, mask: NDArray[np.bool_], exp_profit: float | None) -> dict[str, Any]:
        realized = float(contribution[mask].sum())
        k = int(mask.sum())
        out: dict[str, Any] = {
            "policy": name,
            "n_contacted": k,
            "expected_profit": exp_profit,
            "realized_profit": realized,
            "share_of_oracle": realized / oracle_profit if oracle_profit > 0 else None,
            "random_same_k_profit": k * mean_contribution,
        }
        if n_boot > 0:
            ci = bootstrap_statistic(
                lambda rows: float(contribution[rows][mask[rows]].sum()),
                groups if groups is not None else np.arange(y.size),
                n_boot,
                seed,
            )
            out["realized_profit_ci_low"] = ci.ci_low
            out["realized_profit_ci_high"] = ci.ci_high
        return out

    n = y.size
    rows = [
        row("do_nothing", np.zeros(n, dtype=bool), 0.0),
        row("contact_all", np.ones(n, dtype=bool), None),
    ]
    for name, p in probabilities.items():
        exp_profit = expected_profit(p, econ, params)
        mask = select_unconstrained(exp_profit)
        rows.append(row(name, mask, float(exp_profit[mask].sum())))
    rows.append(row("oracle", oracle_mask, None))
    return rows


def _model_entry(
    y: FloatArray,
    p: FloatArray,
    econ: CustomerEconomics,
    groups: pd.Series,
    cfg: Config,
    calibrator: Calibrator,
) -> dict[str, Any]:
    ev = cfg.evaluation
    return {
        "calibrator": calibrator.to_dict(),
        "mean_p": float(p.mean()),
        "metrics": {
            name: asdict(bootstrap_ci(metric, y, p, groups, ev.n_bootstrap, ev.seed))
            for name, metric in METRICS.items()
        },
        "emp_per_customer": asdict(
            bootstrap_statistic(
                lambda rows: expected_maximum_profit(
                    y[rows],
                    p[rows],
                    econ.subset(rows),
                    cfg.economics,
                    ev.emp_gamma_alpha,
                    ev.emp_gamma_beta,
                ),
                groups,
                ev.n_bootstrap,
                ev.seed,
            )
        ),
        "curves": {
            "pr": pr_points(y, p),
            "roc": roc_points(y, p),
            "gains": gains_points(y, p),
            "reliability": reliability_bins(y, p),
        },
    }


def stability_table(
    snapshots: pd.DataFrame,
    models: dict[str, CalibratedScorer],
    split: TemporalSplit,
    params: EconomicParams,
) -> list[dict[str, Any]]:
    """Every model at every cutoff after the training window: ranking, calibration and profit."""
    rows = []
    later = sorted(pd.Timestamp(c) for c in snapshots["cutoff"].unique() if c > max(split.train))
    for cutoff in later:
        frame = snapshots.loc[snapshots["cutoff"] == cutoff]
        y = frame["churn"].to_numpy(dtype=np.float64)
        econ = frame_economics(frame, params)
        contribution = realized_profit(y, econ, params)
        role = {split.calibration: "calibration", split.test: "test"}.get(cutoff, "out_of_time")
        for name, model in models.items():
            p = model.predict(frame)
            exp_profit = expected_profit(p, econ, params)
            contact = select_unconstrained(exp_profit)
            rows.append(
                {
                    "cutoff": cutoff.date().isoformat(),
                    "role": role,
                    "model": name,
                    "n_customers": int(y.size),
                    "churn_rate": float(y.mean()),
                    "mean_p": float(p.mean()),
                    "roc_auc": roc_auc(y, p),
                    "pr_auc": pr_auc(y, p),
                    "brier": brier(y, p),
                    "n_contacted": int(contact.sum()),
                    "expected_profit": float(exp_profit[contact].sum()),
                    "realized_profit": float(contribution[contact].sum()),
                }
            )
    return rows


def evaluate_models(
    snapshots: pd.DataFrame, scorers: dict[str, Scorer], cfg: Config
) -> dict[str, Any]:
    """The evaluation report: split, populations, per-model results, policies, stability, drift."""
    split = temporal_split(snapshots, cfg)
    cal = snapshots.loc[snapshots["cutoff"] == split.calibration]
    test = snapshots.loc[snapshots["cutoff"] == split.test]
    y_cal = cal["churn"].to_numpy(dtype=np.float64)
    y_test = test["churn"].to_numpy(dtype=np.float64)
    params = cfg.economics
    econ = frame_economics(test, params)
    ev = cfg.evaluation

    calibrated = calibrate_scorers(scorers, cal, ev.seed)
    probabilities = {name: model.predict(test) for name, model in calibrated.items()}
    models = {
        name: _model_entry(
            y_test, probabilities[name], econ, test["customer_id"], cfg, model.calibrator
        )
        for name, model in calibrated.items()
    }
    drift = drift_table(snapshots, split.train, CUSTOMER_FEATURES)
    return {
        "split": {
            "train": [c.date().isoformat() for c in split.train],
            "calibration": split.calibration.date().isoformat(),
            "test": split.test.date().isoformat(),
        },
        "test_population": {"n_customers": int(y_test.size), "churn_rate": float(y_test.mean())},
        "calibration_population": {
            "n_customers": int(y_cal.size),
            "churn_rate": float(y_cal.mean()),
        },
        "economics": params.model_dump(),
        "models": models,
        "policies": policy_table(
            y_test,
            probabilities,
            econ,
            params,
            groups=test["customer_id"],
            n_boot=ev.n_bootstrap,
            seed=ev.seed,
        ),
        "stability": stability_table(snapshots, calibrated, split, params),
        "drift": drift.assign(cutoff=drift["cutoff"].dt.strftime("%Y-%m-%d")).to_dict("records"),
    }


def evaluate_baselines(snapshots: pd.DataFrame, cfg: Config) -> dict[str, Any]:
    """Plan 1's report (cadence rule and BG/NBD), read by notebook 06."""
    return evaluate_models(snapshots, BASELINE_SCORERS, cfg)
