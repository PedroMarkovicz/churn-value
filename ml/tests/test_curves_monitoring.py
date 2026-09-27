import numpy as np
import pandas as pd
import pytest

from churnvalue.curves import gains_points, pr_points, reliability_bins, roc_points
from churnvalue.monitoring import drift_table, psi, psi_band

Y = np.array([1, 1, 0, 0, 0, 0, 0, 0, 0, 0], dtype=float)
PERFECT = np.linspace(1.0, 0.0, 10)  # the two churners score highest


def test_curves_of_a_perfect_ranking():
    pr = pr_points(Y, PERFECT, n_points=11)
    assert pr["precision"] == [1.0] * 11
    roc = roc_points(Y, PERFECT, n_points=11)
    assert roc["tpr"] == [1.0] * 11  # the vertical segment at FPR 0 keeps its top
    gains = gains_points(Y, PERFECT, n_points=11)
    assert gains["captured"][:3] == [0.0, 0.5, 1.0]  # both churners in the top 20 %
    assert gains["captured"][-1] == 1.0


def test_gains_of_all_tied_scores_is_the_random_diagonal():
    gains = gains_points(Y, np.full(10, 0.3), n_points=11)
    assert gains["captured"] == pytest.approx(gains["fraction"])


def test_curves_are_on_fixed_grids():
    rng = np.random.default_rng(0)
    y = rng.integers(0, 2, 500)
    score = rng.random(500)
    assert len(pr_points(y, score)["recall"]) == 101
    assert len(roc_points(y, score)["fpr"]) == 101
    precision = pr_points(y, score)["precision"]
    assert all(a >= b for a, b in zip(precision, precision[1:], strict=False))  # envelope


def test_reliability_bins_count_every_row_and_skip_empty_bins():
    p = np.array([0.05, 0.05, 0.55, 0.95, 1.0])
    y = np.array([0, 1, 1, 1, 1])
    bins = reliability_bins(y, p, n_bins=10)
    assert sum(b["n"] for b in bins) == 5
    assert [b["bin_low"] for b in bins] == [0.0, 0.5, 0.9]  # p = 1.0 falls in the last bin
    assert bins[0]["churn_rate"] == 0.5
    for b in bins:
        assert b["bin_low"] <= b["mean_p"] <= b["bin_high"]


def test_psi_is_zero_for_the_same_sample_and_large_for_a_shift():
    rng = np.random.default_rng(1)
    reference = rng.normal(0, 1, 5000)
    assert psi(reference, reference) == pytest.approx(0.0, abs=1e-12)
    assert psi(reference, rng.normal(0, 1, 5000)) < 0.1
    assert psi(reference, rng.normal(1.0, 1, 5000)) > 0.25


def test_psi_bins_discrete_features_by_value():
    reference = np.array([0] * 90 + [1] * 10)
    current = np.array([0] * 50 + [1] * 50)
    expected = (0.5 - 0.9) * np.log(0.5 / 0.9) + (0.5 - 0.1) * np.log(0.5 / 0.1)
    assert psi(reference, current) == pytest.approx(expected)


def test_psi_flags_values_never_seen_in_the_reference():
    # A constant reference used to share one open bin with every larger value.
    assert psi(np.zeros(100), np.ones(100)) > 5
    assert psi(np.zeros(100), np.zeros(100)) == pytest.approx(0.0)


def test_psi_bands():
    assert psi_band(0.05) == "stable"
    assert psi_band(0.2) == "moderate shift"
    assert psi_band(0.3) == "major shift"


def test_drift_table_covers_every_cutoff_and_feature():
    frame = pd.DataFrame(
        {
            "cutoff": pd.to_datetime(["2011-01-10"] * 50 + ["2011-02-10"] * 50),
            "a": np.r_[np.arange(50), np.arange(50) + 25],
            "b": np.r_[np.zeros(50), np.ones(50)],
        }
    )
    table = drift_table(frame, [pd.Timestamp("2011-01-10")], ["a", "b"])
    assert len(table) == 4
    reference = table.loc[table["cutoff"] == pd.Timestamp("2011-01-10"), "psi"]
    assert reference.abs().max() < 1e-9
    assert table.loc[table["cutoff"] == pd.Timestamp("2011-02-10"), "psi"].min() > 0.25
