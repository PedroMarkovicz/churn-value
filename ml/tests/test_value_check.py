import pandas as pd
import pytest
from conftest import tx_frame

from churnvalue.value_check import BUCKETS, value_backtest, window_revenue


def test_window_revenue_is_the_half_open_label_window_without_returns():
    tx = tx_frame(
        [
            (1, "2011-09-10", "A", 50.0, False),  # on the cutoff: history, not the window
            (1, "2011-09-11", "A", 20.0, False),
            (1, "2011-09-11", "B", 5.0, True),  # a return is never revenue
            (1, "2011-12-09", "A", 30.0, False),  # last day of the window
            (1, "2011-12-10", "A", 99.0, False),  # after the window
        ]
    )
    revenue = window_revenue(tx, pd.Timestamp("2011-09-10"), 90)
    assert revenue.to_dict() == {1: pytest.approx(50.0)}


def test_value_backtest_compares_stayers_only_per_purchase_day_bucket():
    test = pd.DataFrame(
        {
            "customer_id": [1, 2, 3, 4],
            "churn": [0, 0, 1, 0],
            "n_purchase_days": [2, 2, 2, 12],
            "aov_gg": [100.0, 100.0, 100.0, 50.0],
            "cadence_days": [45.0, 90.0, 45.0, 30.0],
        }
    )
    tx = tx_frame(
        [
            (1, "2011-10-01", "A", 150.0, False),
            (2, "2011-10-01", "A", 50.0, False),
            (4, "2011-10-01", "A", 100.0, False),
            (4, "2011-11-01", "A", 50.0, False),
        ]
    )
    rows = {row.bucket: row for row in value_backtest(test, tx, pd.Timestamp("2011-09-10"), 90)}
    assert [row[0] for row in BUCKETS] == list(rows)
    two = rows["2"]
    assert two.n == 2  # customer 3 churned and is left out
    assert two.predicted_revenue == pytest.approx(100 * 90 / 45 + 100 * 90 / 90)
    assert two.actual_revenue == pytest.approx(200.0)
    assert two.ratio == pytest.approx(300.0 / 200.0)
    assert rows["11+"].ratio == pytest.approx((50 * 90 / 30) / 150.0)
    assert rows["3"].n == 0 and rows["3"].ratio is None
