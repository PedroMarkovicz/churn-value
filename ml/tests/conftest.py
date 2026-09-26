"""Shared fixtures: a deterministic synthetic dataset in the raw UCI schema."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from churnvalue.config import SnapshotConfig
from churnvalue.data.clean import clean_transactions

START = pd.Timestamp("2009-12-01")
END = pd.Timestamp("2011-12-09")


def make_raw_transactions(n_customers: int = 300, seed: int = 0) -> pd.DataFrame:
    """Raw-schema invoice lines: customers buy on a personal cadence until an optional dropout."""
    rng = np.random.default_rng(seed)
    rows: list[dict[str, object]] = []
    invoice_no = 489_434
    span_days = (END - START).days
    for customer in range(12_000, 12_000 + n_customers):
        cadence = rng.uniform(10, 90)
        spend_level = rng.lognormal(0.0, 0.6)  # between-customer spend heterogeneity
        day = rng.uniform(0, 365)
        dropout = rng.uniform(180, span_days) if rng.random() < 0.5 else np.inf
        country = "United Kingdom" if rng.random() < 0.85 else "France"
        while day <= min(dropout, span_days):
            when = START + pd.Timedelta(days=float(day)) + pd.Timedelta(hours=10)
            invoice = f"{invoice_no:06d}"
            invoice_no += 1
            for _ in range(int(rng.integers(1, 4))):
                rows.append(
                    {
                        "Invoice": invoice,
                        "StockCode": f"2{int(rng.integers(0, 10_000)):04d}",
                        "Description": "ITEM",
                        "Quantity": int(rng.integers(1, 21)),
                        "InvoiceDate": when,
                        "Price": float(np.round(spend_level * rng.uniform(0.5, 10.0), 2)) + 0.01,
                        "Customer ID": float(customer),
                        "Country": country,
                    }
                )
            if rng.random() < 0.05:  # occasional return of the last line
                last = dict(rows[-1])
                last["Invoice"] = f"C{invoice_no:06d}"
                invoice_no += 1
                last["Quantity"] = -int(last["Quantity"])  # type: ignore[call-overload]
                rows.append(last)
            day += rng.exponential(cadence)
    raw = pd.DataFrame(rows)
    raw["InvoiceDate"] = raw["InvoiceDate"].astype("datetime64[us]")
    return raw


@pytest.fixture(scope="session")
def raw_synthetic() -> pd.DataFrame:
    return make_raw_transactions()


@pytest.fixture(scope="session")
def tx_synthetic(raw_synthetic: pd.DataFrame) -> pd.DataFrame:
    return clean_transactions(raw_synthetic)


@pytest.fixture
def snapshot_cfg() -> SnapshotConfig:
    return SnapshotConfig(
        horizon_days=90, eligibility_f=0.5, min_history_months=6, cadence_floor_days=7.0
    )


def tx_frame(rows: list[tuple[int, str, str, float, bool]]) -> pd.DataFrame:
    """Tiny clean-schema transactions from (customer_id, date, stock_code, revenue, is_return)."""
    return pd.DataFrame(
        {
            "customer_id": pd.Series([r[0] for r in rows], dtype="int64"),
            "invoice": [f"C{i:06d}" if r[4] else f"{i:06d}" for i, r in enumerate(rows)],
            "date": pd.to_datetime([r[1] for r in rows]).astype("datetime64[ns]"),
            "stock_code": [r[2] for r in rows],
            "quantity": pd.Series([-1 if r[4] else 1 for r in rows], dtype="int64"),
            "price": pd.Series([abs(r[3]) for r in rows], dtype="float64"),
            "revenue": pd.Series([r[3] for r in rows], dtype="float64"),
            "is_return": [r[4] for r in rows],
            "country": ["United Kingdom"] * len(rows),
        }
    )
