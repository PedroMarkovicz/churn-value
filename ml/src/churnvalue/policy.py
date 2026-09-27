"""What a calibrated model is worth: profit curves, budgets and sensitivity to the assumptions."""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
import pandas as pd
from numpy.typing import ArrayLike

from churnvalue.economics import (
    EconomicParams,
    customer_economics,
    expected_cost,
    expected_profit,
    realized_profit,
    select_unconstrained,
    select_with_budget,
    value_at_risk,
)


def profit_curve(
    y: ArrayLike, p: ArrayLike, aov: ArrayLike, cadence: ArrayLike, params: EconomicParams
) -> pd.DataFrame:
    """Expected and realized profit of contacting the top-k customers by expected profit."""
    econ = customer_economics(value_at_risk(aov, cadence, params), params)
    exp_profit = expected_profit(p, econ, params)
    order = np.argsort(-exp_profit, kind="stable")
    realized = realized_profit(y, econ, params)[order]
    return pd.DataFrame(
        {
            "k": np.arange(order.size + 1),
            "expected_profit": np.concatenate([[0.0], np.cumsum(exp_profit[order])]),
            "realized_profit": np.concatenate([[0.0], np.cumsum(realized)]),
        }
    )


def budget_curve(
    y: ArrayLike,
    p: ArrayLike,
    aov: ArrayLike,
    cadence: ArrayLike,
    params: EconomicParams,
    budgets: Sequence[float],
) -> pd.DataFrame:
    """Budget mode: greedy selection by expected profit until the expected spend hits the budget."""
    econ = customer_economics(value_at_risk(aov, cadence, params), params)
    exp_profit = expected_profit(p, econ, params)
    exp_cost = expected_cost(p, econ, params)
    realized = realized_profit(y, econ, params)
    rows = []
    for budget in budgets:
        mask = select_with_budget(exp_profit, exp_cost, budget=budget)
        rows.append(
            {
                "budget": float(budget),
                "n_contacted": int(mask.sum()),
                "expected_spend": float(exp_cost[mask].sum()),
                "expected_profit": float(exp_profit[mask].sum()),
                "realized_profit": float(realized[mask].sum()),
            }
        )
    return pd.DataFrame(rows)


def sensitivity_grid(
    y: ArrayLike,
    p: ArrayLike,
    aov: ArrayLike,
    cadence: ArrayLike,
    params: EconomicParams,
    gammas: Sequence[float],
    lambda_cs: Sequence[float],
) -> pd.DataFrame:
    """The unconstrained policy under every (gamma, lambda_c) pair, other assumptions fixed."""
    rows = []
    for gamma in gammas:
        for lambda_c in lambda_cs:
            scenario = params.model_copy(update={"gamma": gamma, "lambda_c": lambda_c})
            econ = customer_economics(value_at_risk(aov, cadence, scenario), scenario)
            exp_profit = expected_profit(p, econ, scenario)
            mask = select_unconstrained(exp_profit)
            rows.append(
                {
                    "gamma": float(gamma),
                    "lambda_c": float(lambda_c),
                    "n_contacted": int(mask.sum()),
                    "expected_profit": float(exp_profit[mask].sum()),
                    "realized_profit": float(realized_profit(y, econ, scenario)[mask].sum()),
                }
            )
    return pd.DataFrame(rows)
