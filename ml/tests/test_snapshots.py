import pandas as pd
import pytest
from conftest import tx_frame

from churnvalue.config import SnapshotConfig
from churnvalue.snapshots import (
    build_snapshot,
    build_snapshots,
    churn_labels,
    eligible_mask,
    make_cutoffs,
)


def test_make_cutoffs_matches_real_dataset_calendar():
    cutoffs = make_cutoffs(
        pd.Timestamp("2009-12-01"),
        pd.Timestamp("2011-12-09"),
        horizon_days=90,
        min_history_months=6,
    )
    assert len(cutoffs) == 16
    assert cutoffs[0] == pd.Timestamp("2010-06-10")
    assert cutoffs[-1] == pd.Timestamp("2011-09-10")
    assert cutoffs == sorted(cutoffs)


def test_make_cutoffs_does_not_drift_from_month_end():
    # 2011-06-29 - 90 days = 2011-03-31; February clamps to the 28th but later months recover.
    cutoffs = make_cutoffs(
        pd.Timestamp("2010-01-01"),
        pd.Timestamp("2011-06-29"),
        horizon_days=90,
        min_history_months=6,
    )
    assert cutoffs[-1] == pd.Timestamp("2011-03-31")
    assert pd.Timestamp("2011-02-28") in cutoffs
    assert pd.Timestamp("2010-12-31") in cutoffs


def test_eligible_mask_uses_expected_next_purchase_window():
    feats = pd.DataFrame(
        {
            "n_purchase_days": [5, 5, 5, 1, 5],
            "cadence_days": [30.0, 30.0, 200.0, 30.0, 30.0],
            "recency_days": [10, 76, 10, 10, 75],
        }
    )
    # days to expected purchase = cadence - recency; window [-45, 135] for H=90, f=0.5
    #  20 -> in; -46 -> out (overdue too long); 190 -> out (too far);
    #  single purchase -> out; -45 -> in (boundary)
    assert eligible_mask(feats, horizon_days=90, f=0.5).tolist() == [
        True,
        False,
        False,
        False,
        True,
    ]


def test_churn_labels_use_half_open_window_and_ignore_returns():
    tx = tx_frame(
        [
            (1, "2011-01-01", "10001", 10.0, False),  # on the cutoff: not in the future window
            (2, "2011-04-01", "10001", 10.0, False),  # last day of the window: active
            (3, "2011-04-02", "10001", 10.0, False),  # one day after: churn
            (4, "2011-02-01", "10001", -10.0, True),  # a return is not a purchase: churn
        ]
    )
    labels = churn_labels(tx, pd.Index([1, 2, 3, 4]), pd.Timestamp("2011-01-01"), horizon_days=90)
    assert labels.tolist() == [1, 0, 1, 1]


def test_build_snapshot_columns_and_eligibility(tx_synthetic, snapshot_cfg: SnapshotConfig):
    snap = build_snapshot(tx_synthetic, pd.Timestamp("2011-03-10"), snapshot_cfg)
    assert {"cutoff", "customer_id", "churn", "p_alive", "aov_gg", "cadence_days"} <= set(
        snap.columns
    )
    assert (snap["n_purchase_days"] >= 2).all()
    assert snap["churn"].isin([0, 1]).all()
    assert snap["p_alive"].between(0, 1).all()
    assert (snap["aov_gg"] > 0).all()
    assert snap["customer_id"].is_unique


def test_build_snapshots_has_both_classes_per_cutoff(tx_synthetic, snapshot_cfg: SnapshotConfig):
    snaps = build_snapshots(tx_synthetic, snapshot_cfg)
    rates = snaps.groupby("cutoff")["churn"].mean()
    assert len(rates) == 16
    assert rates.between(0.02, 0.98).all()


@pytest.mark.slow
def test_real_dataset_snapshot_sizes():
    snaps = pd.read_parquet("data/interim/snapshots.parquet")
    sizes = snaps.groupby("cutoff").size()
    assert sizes.loc[pd.Timestamp("2011-09-10")] == 1918
    assert sizes.loc[pd.Timestamp("2011-06-10")] == 1852
