"""Backtest of the value formula (design §4.1): does V predict what kept customers spend?

For customers who stayed through the label window, the formula's revenue for the window,
``aov_gg * H / cadence``, is compared with what they actually spent in it. The margin and the
value horizon scale both sides equally, so revenue over H is the like-for-like check.
"""

from __future__ import annotations

import pandas as pd

from churnvalue.contract import ValueCheckRow
from churnvalue.features import purchase_days

# (label, min purchase days, max purchase days or None)
BUCKETS: tuple[tuple[str, int, int | None], ...] = (
    ("2", 2, 2),
    ("3", 3, 3),
    ("4-5", 4, 5),
    ("6-10", 6, 10),
    ("11+", 11, None),
)


def window_revenue(tx: pd.DataFrame, cutoff: pd.Timestamp, horizon_days: int) -> pd.Series:
    """Gross revenue per customer in (cutoff, cutoff + H], returns excluded."""
    end = cutoff + pd.Timedelta(days=horizon_days)
    days = purchase_days(tx.loc[(tx["date"] > cutoff) & (tx["date"] <= end)])
    return days.groupby("customer_id")["revenue"].sum()


def value_backtest(
    test: pd.DataFrame, tx: pd.DataFrame, cutoff: pd.Timestamp, horizon_days: int
) -> list[ValueCheckRow]:
    """One row per purchase-day bucket, over the test cutoff's customers who stayed."""
    stayed = test.loc[test["churn"] == 0]
    actual = window_revenue(tx, cutoff, horizon_days)
    predicted = stayed["aov_gg"] * horizon_days / stayed["cadence_days"]
    frame = pd.DataFrame(
        {
            "n_purchase_days": stayed["n_purchase_days"].to_numpy(),
            "predicted": predicted.to_numpy(),
            "actual": stayed["customer_id"].map(actual).fillna(0.0).to_numpy(),
        }
    )
    rows = []
    for label, low, high in BUCKETS:
        upper = float("inf") if high is None else high
        part = frame.loc[frame["n_purchase_days"].between(low, upper)]
        predicted_sum, actual_sum = float(part["predicted"].sum()), float(part["actual"].sum())
        rows.append(
            ValueCheckRow(
                bucket=label,
                min_purchase_days=low,
                max_purchase_days=high,
                n=len(part),
                predicted_revenue=predicted_sum,
                actual_revenue=actual_sum,
                ratio=predicted_sum / actual_sum if actual_sum > 0 else None,
            )
        )
    return rows
