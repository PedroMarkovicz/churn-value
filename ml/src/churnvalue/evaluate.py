"""Evaluate calibrated scorers on the test cutoff: metrics with CIs, EMP and policy profits."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

import numpy as np
import pandas as pd
from numpy.typing import ArrayLike, NDArray

from churnvalue.calibration import select_calibrator
from churnvalue.config import Config
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
    expected_maximum_profit,
)
from churnvalue.splits import make_temporal_split

FloatArray = NDArray[np.float64]

BASELINE_SCORERS = {
    # Higher score = more likely to churn.
    "cadence_rule": lambda snap: snap["overdue_ratio"].to_numpy(dtype=np.float64),
    "bgnbd": lambda snap: 1.0 - snap["p_alive"].to_numpy(dtype=np.float64),
}


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


def evaluate_baselines(snapshots: pd.DataFrame, cfg: Config) -> dict[str, Any]:
    cutoffs = sorted(pd.to_datetime(snapshots["cutoff"].unique()))
    split = make_temporal_split(
        cutoffs, cfg.snapshots.horizon_days, cfg.splits.calibration_offset_months
    )
    cal = snapshots.loc[snapshots["cutoff"] == split.calibration]
    test = snapshots.loc[snapshots["cutoff"] == split.test]
    y_cal = cal["churn"].to_numpy(dtype=np.float64)
    y_test = test["churn"].to_numpy(dtype=np.float64)

    params = cfg.economics
    econ = customer_economics(value_at_risk(test["aov_gg"], test["cadence_days"], params), params)
    ev = cfg.evaluation

    models: dict[str, Any] = {}
    probabilities: dict[str, FloatArray] = {}
    for name, scorer in BASELINE_SCORERS.items():
        calibrator = select_calibrator(scorer(cal), y_cal, seed=ev.seed)
        p_test = calibrator.transform(scorer(test))
        probabilities[name] = p_test
        models[name] = {
            "calibrator": calibrator.to_dict(),
            "metrics": {
                metric_name: asdict(
                    bootstrap_ci(
                        metric, y_test, p_test, test["customer_id"], ev.n_bootstrap, ev.seed
                    )
                )
                for metric_name, metric in METRICS.items()
            },
            "emp_per_customer": asdict(
                bootstrap_statistic(
                    lambda rows, p=p_test: expected_maximum_profit(
                        y_test[rows],
                        p[rows],
                        econ.subset(rows),
                        params,
                        ev.emp_gamma_alpha,
                        ev.emp_gamma_beta,
                    ),
                    test["customer_id"],
                    ev.n_bootstrap,
                    ev.seed,
                )
            ),
        }

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
    }
