import numpy as np
import pandas as pd
import pytest
from conftest import tx_frame

from churnvalue.features import (
    BASE_FEATURES,
    add_context_features,
    add_derived_features,
    compute_base_features,
)

CUTOFF = pd.Timestamp("2011-03-31")


@pytest.fixture
def base() -> pd.DataFrame:
    # Customer 1: purchases on 2010-03-10 (last year's window), 2010-12-31, 2011-01-30, 2011-03-01
    # (two lines that day), one return, and a purchase AFTER the cutoff that must be ignored.
    # Customer 2: a single purchase.
    tx = tx_frame(
        [
            (1, "2010-03-10", "10001", 50.0, False),
            (1, "2010-12-31", "10001", 100.0, False),
            (1, "2011-01-30", "10002", 200.0, False),
            (1, "2011-03-01", "10001", 250.0, False),
            (1, "2011-03-01", "10003", 50.0, False),
            (1, "2011-03-05", "10003", -60.0, True),
            (1, "2011-04-15", "10009", 999.0, False),
            (2, "2011-02-14", "10001", 80.0, False),
        ]
    )
    return compute_base_features(tx, CUTOFF, horizon_days=90)


def test_columns_and_customers(base: pd.DataFrame):
    assert list(base.columns) == BASE_FEATURES
    assert base.index.tolist() == [1, 2]


def test_rfm_features_for_customer_1(base: pd.DataFrame):
    c1 = base.loc[1]
    assert c1["recency_days"] == 30  # 2011-03-01 -> 2011-03-31
    assert c1["tenure_days"] == 386  # 2010-03-10 -> 2011-03-31
    assert c1["n_purchase_days"] == 4
    assert c1["total_spend"] == pytest.approx(650.0)
    assert c1["avg_order_value"] == pytest.approx(162.5)
    assert c1["n_distinct_products"] == 3
    assert c1["return_rate"] == pytest.approx(60.0 / 650.0)


def test_windowed_features_for_customer_1(base: pd.DataFrame):
    c1 = base.loc[1]
    # (2010-12-31, 2011-03-31]: 2011-01-30 and 2011-03-01
    assert c1["spend_90d"] == pytest.approx(500.0)
    assert c1["purchases_90d"] == 2
    # (2010-10-02, 2010-12-31]: 2010-12-31
    assert c1["spend_prev_90d"] == pytest.approx(100.0)
    # Last year's window is (cutoff - 365d, cutoff - 365d + 90d] = (2010-03-31, 2010-06-29],
    # which excludes 2010-03-10.
    assert c1["bought_same_window_last_year"] == 0
    gaps = np.array([296.0, 30.0, 30.0])
    assert c1["cadence_cv"] == pytest.approx(gaps.std(ddof=1) / gaps.mean())
    assert c1["is_uk"] == 1


def test_single_purchase_customer(base: pd.DataFrame):
    c2 = base.loc[2]
    assert c2["n_purchase_days"] == 1
    assert c2["cadence_cv"] == 0.0
    assert c2["spend_prev_90d"] == 0.0


def test_bought_same_window_last_year_detects_purchase():
    tx = tx_frame(
        [
            (1, "2010-05-01", "10001", 10.0, False),  # inside (2010-03-31, 2010-06-29]
            (1, "2011-03-01", "10001", 10.0, False),
        ]
    )
    feats = compute_base_features(tx, CUTOFF, horizon_days=90)
    assert feats.loc[1, "bought_same_window_last_year"] == 1


def test_derived_features(base: pd.DataFrame):
    out = add_derived_features(base, horizon_days=90, cadence_floor_days=7.0)
    c1 = out.loc[1]
    assert c1["cadence_days"] == pytest.approx((386 - 30) / 3)
    assert c1["overdue_ratio"] == pytest.approx(30 / ((386 - 30) / 3))
    assert c1["expected_purchases_h"] == pytest.approx(90 / ((386 - 30) / 3))
    assert c1["spend_trend"] == pytest.approx(500.0 / 101.0)
    # Single purchase: span 0 -> cadence floored at 7 days.
    assert out.loc[2, "cadence_days"] == 7.0


def test_context_features_encode_cutoff_month():
    frame = pd.DataFrame({"x": [1, 2]})
    out = add_context_features(frame, pd.Timestamp("2011-03-10"))
    assert out["cutoff_month_sin"].tolist() == pytest.approx([1.0, 1.0])
    assert out["cutoff_month_cos"].tolist() == pytest.approx([0.0, 0.0], abs=1e-12)


def test_customer_with_only_returns_has_no_feature_row():
    tx = tx_frame(
        [
            (1, "2011-03-01", "10001", 10.0, False),
            (3, "2011-03-02", "10001", -10.0, True),
        ]
    )
    assert compute_base_features(tx, CUTOFF, horizon_days=90).index.tolist() == [1]
