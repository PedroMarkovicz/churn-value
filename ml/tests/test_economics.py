import numpy as np
import pytest

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

PARAMS = EconomicParams(
    margin=0.35, lambda_c=0.10, lambda_a=10.0, gamma=0.30, contact_cost=1.0, value_horizon_days=365
)


def test_value_at_risk_is_margin_times_aov_times_expected_purchases():
    # 0.35 * 200 * (365 / 73) = 350
    assert value_at_risk([200.0], [73.0], PARAMS)[0] == pytest.approx(350.0)


def test_customer_economics_crc_cac_and_benefit_regimes():
    econ = customer_economics([1000.0], PARAMS)
    assert econ.crc[0] == pytest.approx(100.0)  # 0.10 * V
    assert econ.cac[0] == pytest.approx(1000.0)  # 10 * CRC
    assert econ.benefit[0] == pytest.approx(1000.0)  # min(V, CAC) = V (boundary)
    cheap_acquisition = customer_economics([1000.0], PARAMS.model_copy(update={"lambda_a": 4.0}))
    assert cheap_acquisition.benefit[0] == pytest.approx(400.0)  # CAC < V -> B = CAC


def test_expected_profit_hand_computed():
    econ = customer_economics([1000.0, 1000.0], PARAMS)
    # p=0.5: 0.5*0.3*(1000-100) - 0.5*100 - 1 = 135 - 50 - 1 = 84
    # p=0.1: 0.1*0.3*900 - 0.9*100 - 1 = 27 - 90 - 1 = -64
    assert expected_profit([0.5, 0.1], econ, PARAMS) == pytest.approx([84.0, -64.0])


def test_decision_threshold_matches_closed_form():
    econ = customer_economics([1000.0], PARAMS)
    # p* = (CRC + c) / (gamma*(B - CRC) + CRC) = 101 / 370
    p_star = 101.0 / 370.0
    assert expected_profit([p_star], econ, PARAMS)[0] == pytest.approx(0.0, abs=1e-9)
    assert select_unconstrained(
        expected_profit([p_star + 1e-6, p_star - 1e-6], econ, PARAMS)
    ).tolist() == [True, False]


def test_expected_cost_counts_accepting_churners_and_all_non_churners():
    econ = customer_economics([1000.0], PARAMS)
    # 1 + 100 * (0.5*0.3 + 0.5) = 66
    assert expected_cost([0.5], econ, PARAMS)[0] == pytest.approx(66.0)


def test_realized_profit_by_true_label():
    econ = customer_economics([1000.0, 1000.0], PARAMS)
    # churner: 0.3*900 - 1 = 269; non-churner: -100 - 1 = -101
    assert realized_profit([1, 0], econ, PARAMS) == pytest.approx([269.0, -101.0])


def test_budget_selection_is_greedy_by_expected_profit():
    profit = np.array([10.0, 50.0, -5.0, 30.0])
    cost = np.array([20.0, 20.0, 20.0, 20.0])
    assert select_with_budget(profit, cost).tolist() == [True, True, False, True]
    assert select_with_budget(profit, cost, budget=40.0).tolist() == [False, True, False, True]
    assert select_with_budget(profit, cost, max_contacts=1).tolist() == [False, True, False, False]
    assert select_with_budget(profit, cost, budget=0.0).tolist() == [False, False, False, False]


def test_customer_economics_subset_keeps_arrays_aligned():
    econ = customer_economics([100.0, 200.0, 300.0], PARAMS)
    sub = econ.subset(np.array([2, 0, 2]))
    assert sub.value.tolist() == [300.0, 100.0, 300.0]
    assert sub.crc.tolist() == pytest.approx([30.0, 10.0, 30.0])
    assert sub.benefit.tolist() == pytest.approx([300.0, 100.0, 300.0])
