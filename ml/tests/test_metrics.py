import numpy as np
import pytest

from churnvalue.economics import EconomicParams, customer_economics
from churnvalue.metrics import (
    bootstrap_ci,
    bootstrap_statistic,
    expected_maximum_profit,
    lift_at,
    roc_auc,
)

PARAMS = EconomicParams(
    margin=0.35, lambda_c=0.10, lambda_a=10.0, gamma=0.30, contact_cost=1.0, value_horizon_days=365
)


def test_lift_at_top_decile():
    y = np.array([1, 1, 0, 0, 0, 0, 0, 0, 0, 0], dtype=float)
    score = np.linspace(1.0, 0.0, 10)
    # top 1 of 10 is a churner: precision 1.0 / base rate 0.2 = 5
    assert lift_at(y, score, 0.1) == pytest.approx(5.0)


def test_bootstrap_ci_brackets_point_estimate():
    rng = np.random.default_rng(0)
    y = rng.integers(0, 2, 500).astype(float)
    score = y * 0.3 + rng.random(500)
    est = bootstrap_ci(roc_auc, y, score, groups=np.arange(500), n_boot=300, seed=1)
    assert est.ci_low < est.value < est.ci_high
    assert 0.5 < est.value < 1.0


def test_bootstrap_resamples_customers_not_rows():
    # Two rows per customer with identical labels: clustering must keep them together,
    # so the CI is wider than when rows are (wrongly) treated as independent.
    rng = np.random.default_rng(0)
    y_c = rng.integers(0, 2, 200).astype(float)
    s_c = y_c * 0.2 + rng.random(200)
    y, s = np.repeat(y_c, 2), np.repeat(s_c, 2)
    clustered = bootstrap_ci(roc_auc, y, s, groups=np.repeat(np.arange(200), 2), n_boot=300, seed=1)
    naive = bootstrap_ci(roc_auc, y, s, groups=np.arange(400), n_boot=300, seed=1)
    assert (clustered.ci_high - clustered.ci_low) > (naive.ci_high - naive.ci_low)


def test_emp_hand_computed_with_degenerate_gamma():
    # Beta(1e6, 1e6*7/3) concentrates gamma near 0.3.
    econ = customer_economics([1000.0, 1000.0], PARAMS)
    y = np.array([1.0, 0.0])
    score = np.array([0.9, 0.1])
    # Contact the churner only: 0.3*900 - 1 = 269; adding the non-churner: -101 -> max = 269.
    emp = expected_maximum_profit(y, score, econ, PARAMS, gamma_alpha=1e6, gamma_beta=1e6 * 7 / 3)
    assert emp == pytest.approx(269.0 / 2, rel=1e-3)


def test_emp_is_zero_when_no_contact_pays():
    econ = customer_economics([1000.0], PARAMS)
    emp = expected_maximum_profit(np.array([0.0]), np.array([0.9]), econ, PARAMS, 6.0, 14.0)
    assert emp == 0.0


def test_lift_counts_a_straddling_tie_block_by_its_expected_value():
    # k = 2: one churner strictly above the tie, then one slot drawn from a tie of {0, 1}.
    # Expected precision under random tie-breaking = (1 + 0.5) / 2 = 0.75; base rate 0.5.
    y = np.array([1.0, 0.0, 1.0, 0.0])
    score = np.array([0.9, 0.5, 0.5, 0.1])
    assert lift_at(y, score, 0.5) == pytest.approx(1.5)
    assert lift_at(y[::-1], score[::-1], 0.5) == pytest.approx(1.5)


def test_emp_only_cuts_at_tie_group_boundaries():
    econ = customer_economics([1000.0, 1000.0], PARAMS)
    tied = np.array([0.5, 0.5])
    # A cut inside the tie is not a reachable threshold: options are k=0 (0) or k=2 (269-101).
    for y in (np.array([1.0, 0.0]), np.array([0.0, 1.0])):
        emp = expected_maximum_profit(y, tied, econ, PARAMS, 1e6, 1e6 * 7 / 3)
        assert emp == pytest.approx(168.0 / 2, rel=1e-3)


def test_lift_and_emp_are_invariant_to_row_order_with_ties():
    rng = np.random.default_rng(0)
    n = 400
    y = rng.integers(0, 2, n).astype(float)
    score = np.round(rng.random(n) * 4) / 4  # heavy ties, like isotonic output
    econ = customer_economics(rng.uniform(100, 2000, n), PARAMS)
    perm = rng.permutation(n)
    econ_perm = econ.subset(perm)
    assert lift_at(y, score) == pytest.approx(lift_at(y[perm], score[perm]))
    assert expected_maximum_profit(y, score, econ, PARAMS, 6.0, 14.0) == pytest.approx(
        expected_maximum_profit(y[perm], score[perm], econ_perm, PARAMS, 6.0, 14.0)
    )


def test_bootstrap_statistic_resamples_aligned_arrays():
    rng = np.random.default_rng(0)
    n = 300
    y = rng.integers(0, 2, n).astype(float)
    score = y * 0.3 + rng.random(n)
    econ = customer_economics(rng.uniform(100, 2000, n), PARAMS)

    def emp(idx: np.ndarray) -> float:
        return expected_maximum_profit(y[idx], score[idx], econ.subset(idx), PARAMS, 6.0, 14.0)

    est = bootstrap_statistic(emp, groups=np.arange(n), n_boot=200, seed=1)
    assert est.value == pytest.approx(emp(np.arange(n)))
    assert est.ci_low < est.value < est.ci_high
