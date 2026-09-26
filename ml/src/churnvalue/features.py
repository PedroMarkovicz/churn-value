"""Customer features at a cutoff. Base features use only transactions dated <= cutoff."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

BASE_FEATURES = [
    "recency_days",
    "n_purchase_days",
    "tenure_days",
    "total_spend",
    "avg_order_value",
    "n_distinct_products",
    "return_rate",
    "spend_90d",
    "spend_prev_90d",
    "purchases_90d",
    "cadence_cv",
    "bought_same_window_last_year",
    "is_uk",
]
# Derived features are pure arithmetic on base features; web/ re-implements them (ADR 0009).
DERIVED_FEATURES = ["cadence_days", "overdue_ratio", "expected_purchases_h", "spend_trend"]
# Context features describe the cutoff, not the customer; fixed (not editable) in the what-if.
# They let supervised models learn the seasonal churn base rate, which calibration needs.
CONTEXT_FEATURES = ["cutoff_month_sin", "cutoff_month_cos"]
SPEND_TREND_EPS = 1.0


@dataclass(frozen=True)
class FeatureInfo:
    group: str  # "base" | "derived" | "context"
    unit: str
    description: str
    editable: bool  # editable in the browser what-if (base features only)


# Single source for documentation, the notebooks and (Plan 2) the web feature spec.
FEATURE_CATALOGUE: dict[str, FeatureInfo] = {
    "recency_days": FeatureInfo("base", "days", "days since the last purchase day", True),
    "n_purchase_days": FeatureInfo("base", "days", "distinct days with a purchase", True),
    "tenure_days": FeatureInfo("base", "days", "days since the first purchase day", True),
    "total_spend": FeatureInfo("base", "£", "gross spend on purchase days", True),
    "avg_order_value": FeatureInfo("base", "£", "gross spend per purchase day", True),
    "n_distinct_products": FeatureInfo("base", "count", "distinct stock codes bought", True),
    "return_rate": FeatureInfo("base", "share", "returned value / gross spend, in [0, 1]", True),
    "spend_90d": FeatureInfo("base", "£", "spend in the 90 days before the cutoff", True),
    "spend_prev_90d": FeatureInfo("base", "£", "spend in the 90 days before those", True),
    "purchases_90d": FeatureInfo("base", "days", "purchase days in the last 90 days", True),
    "cadence_cv": FeatureInfo("base", "ratio", "std / mean of gaps between purchase days", True),
    "bought_same_window_last_year": FeatureInfo(
        "base", "0/1", "bought in the same horizon window one year earlier", True
    ),
    "is_uk": FeatureInfo("base", "0/1", "most frequent country is the United Kingdom", True),
    "cadence_days": FeatureInfo(
        "derived", "days", "max((tenure - recency) / (purchase days - 1), floor)", False
    ),
    "overdue_ratio": FeatureInfo("derived", "ratio", "recency / cadence: cycles late", False),
    "expected_purchases_h": FeatureInfo(
        "derived", "count", "horizon / cadence: purchases expected in H", False
    ),
    "spend_trend": FeatureInfo("derived", "ratio", "spend_90d / (spend_prev_90d + £1)", False),
    "cutoff_month_sin": FeatureInfo("context", "-", "sin(2π · cutoff month / 12)", False),
    "cutoff_month_cos": FeatureInfo("context", "-", "cos(2π · cutoff month / 12)", False),
}
UK = "United Kingdom"


def purchase_days(tx: pd.DataFrame) -> pd.DataFrame:
    """One row per (customer, purchase day) with the day's gross revenue. Returns are excluded."""
    buys = tx.loc[~tx["is_return"]]
    return buys.groupby(["customer_id", "date"])["revenue"].sum().reset_index()


def compute_base_features(
    tx: pd.DataFrame, cutoff: pd.Timestamp, horizon_days: int
) -> pd.DataFrame:
    hist = tx.loc[tx["date"] <= cutoff]
    days = purchase_days(hist).sort_values(["customer_id", "date"])
    by_customer = days.groupby("customer_id")
    first = by_customer["date"].min()
    last = by_customer["date"].max()
    n_days = by_customer["date"].size()
    total = by_customer["revenue"].sum()
    index = first.index

    feats = pd.DataFrame(index=index)
    feats["recency_days"] = (cutoff - last).dt.days.astype("int64")
    feats["n_purchase_days"] = n_days.astype("int64")
    feats["tenure_days"] = (cutoff - first).dt.days.astype("int64")
    feats["total_spend"] = total.astype("float64")
    feats["avg_order_value"] = (total / n_days).astype("float64")

    buys = hist.loc[~hist["is_return"]]
    feats["n_distinct_products"] = (
        buys.groupby("customer_id")["stock_code"].nunique().reindex(index).astype("int64")
    )
    returned = -hist.loc[hist["is_return"]].groupby("customer_id")["revenue"].sum()
    feats["return_rate"] = (returned.reindex(index, fill_value=0.0) / total).clip(0.0, 1.0)

    d90 = cutoff - pd.Timedelta(days=90)
    d180 = cutoff - pd.Timedelta(days=180)
    recent = days.loc[days["date"] > d90]
    previous = days.loc[(days["date"] > d180) & (days["date"] <= d90)]
    feats["spend_90d"] = (
        recent.groupby("customer_id")["revenue"].sum().reindex(index, fill_value=0.0)
    )
    feats["spend_prev_90d"] = (
        previous.groupby("customer_id")["revenue"].sum().reindex(index, fill_value=0.0)
    )
    feats["purchases_90d"] = (
        recent.groupby("customer_id").size().reindex(index, fill_value=0).astype("int64")
    )

    gaps = days.groupby("customer_id")["date"].diff().dt.days
    gap_stats = gaps.groupby(days["customer_id"]).agg(["mean", "std"])
    feats["cadence_cv"] = (gap_stats["std"] / gap_stats["mean"]).reindex(index).fillna(0.0)

    last_year_start = cutoff - pd.Timedelta(days=365)
    last_year_end = last_year_start + pd.Timedelta(days=horizon_days)
    last_year = days.loc[(days["date"] > last_year_start) & (days["date"] <= last_year_end)]
    feats["bought_same_window_last_year"] = index.isin(last_year["customer_id"].unique()).astype(
        "int64"
    )

    country = buys.groupby("customer_id")["country"].agg(lambda s: s.mode().iat[0])
    feats["is_uk"] = (country.reindex(index) == UK).astype("int64")

    feats.index.name = "customer_id"
    return feats[BASE_FEATURES]


def add_derived_features(
    base: pd.DataFrame, horizon_days: int, cadence_floor_days: float
) -> pd.DataFrame:
    out = base.copy()
    span_days = (out["tenure_days"] - out["recency_days"]).astype("float64")
    intervals = (out["n_purchase_days"] - 1).clip(lower=1).astype("float64")
    out["cadence_days"] = np.maximum(span_days / intervals, cadence_floor_days)
    out["overdue_ratio"] = out["recency_days"] / out["cadence_days"]
    out["expected_purchases_h"] = horizon_days / out["cadence_days"]
    out["spend_trend"] = out["spend_90d"] / (out["spend_prev_90d"] + SPEND_TREND_EPS)
    return out


def add_context_features(features: pd.DataFrame, cutoff: pd.Timestamp) -> pd.DataFrame:
    out = features.copy()
    angle = 2.0 * np.pi * cutoff.month / 12.0
    out["cutoff_month_sin"] = float(np.sin(angle))
    out["cutoff_month_cos"] = float(np.cos(angle))
    return out
