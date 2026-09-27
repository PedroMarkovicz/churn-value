import numpy as np
import pytest

from churnvalue.economics import EconomicParams
from churnvalue.policy import budget_curve, profit_curve, sensitivity_grid

PARAMS = EconomicParams(
    margin=0.35, lambda_c=0.10, lambda_a=10.0, gamma=0.30, contact_cost=1.0, value_horizon_days=365
)
# Every customer has V = 0.35 * 100 * 365 / 36.5 = 350, so CRC = 35 and B = 350.
AOV = np.full(4, 100.0)
CADENCE = np.full(4, 36.5)
Y = np.array([1.0, 0.0, 1.0, 0.0])
P = np.array([0.9, 0.8, 0.2, 0.1])


def test_profit_curve_hand_computed():
    curve = profit_curve(Y, P, AOV, CADENCE, PARAMS)
    # E[profit] = p * 0.3 * 315 - (1 - p) * 35 - 1; realized: churner 93.5, non-churner -36.
    assert curve["k"].tolist() == [0, 1, 2, 3, 4]
    assert curve["expected_profit"].iloc[1] == pytest.approx(0.9 * 94.5 - 0.1 * 35 - 1)
    assert curve["realized_profit"].tolist() == pytest.approx([0.0, 93.5, 57.5, 151.0, 115.0])


def test_budget_curve_never_overspends_and_grows_with_budget():
    rng = np.random.default_rng(0)
    n = 300
    curve = budget_curve(
        rng.integers(0, 2, n),
        rng.random(n),
        rng.uniform(20, 500, n),
        rng.uniform(7, 120, n),
        PARAMS,
        budgets=[0.0, 100.0, 1_000.0, 10_000.0],
    )
    assert (curve["expected_spend"] <= curve["budget"] + 1e-9).all()
    assert curve["n_contacted"].is_monotonic_increasing
    assert curve["n_contacted"].iloc[0] == 0


def test_sensitivity_grid_covers_every_scenario_and_gamma_zero_never_pays():
    grid = sensitivity_grid(Y, P, AOV, CADENCE, PARAMS, [0.0, 0.3], [0.05, 0.10])
    assert len(grid) == 4
    at_default = grid.loc[(grid["gamma"] == 0.3) & (grid["lambda_c"] == 0.10)].iloc[0]
    assert at_default["n_contacted"] == 2  # p = 0.9 and 0.8 clear p* ~ 0.29
    assert (grid.loc[grid["gamma"] == 0.0, "n_contacted"] == 0).all()
