"""Raw invoice lines -> clean transaction table (one row per invoice line)."""

from __future__ import annotations

from collections.abc import Callable, Hashable
from dataclasses import dataclass

import pandas as pd
import pandera.pandas as pa

PRODUCT_CODE_PATTERN = r"^\d{5}"  # real products start with 5 digits; POST, DOT, M, ... are not
TX_COLUMNS = [
    "customer_id",
    "invoice",
    "date",
    "stock_code",
    "quantity",
    "price",
    "revenue",
    "is_return",
    "country",
]

TRANSACTIONS_SCHEMA = pa.DataFrameSchema(
    {
        "customer_id": pa.Column("int64", pa.Check.gt(0)),
        "invoice": pa.Column(checks=pa.Check.str_matches(r"^C?\d{6}$")),
        "date": pa.Column("datetime64[ns]"),
        "stock_code": pa.Column(checks=pa.Check.str_matches(PRODUCT_CODE_PATTERN)),
        "quantity": pa.Column("int64", pa.Check.ne(0)),
        "price": pa.Column("float64", pa.Check.gt(0)),
        "revenue": pa.Column("float64"),
        "is_return": pa.Column("bool"),
        "country": pa.Column(),
    },
    checks=pa.Check(
        lambda df: (df["revenue"] < 0) == df["is_return"],
        error="returns (C-invoices) must be exactly the negative-revenue lines",
    ),
    strict=True,
    ordered=True,
)


@dataclass(frozen=True)
class CleaningRule:
    name: str
    reason: str
    drops: Callable[[pd.DataFrame], pd.Series]  # True = drop this line


# Applied in this order; clean_transactions and cleaning_audit share it (one source of truth).
CLEANING_RULES: tuple[CleaningRule, ...] = (
    CleaningRule(
        "exact_duplicates",
        "identical invoice lines repeated in the export",
        lambda df: df.duplicated(),
    ),
    CleaningRule(
        "missing_customer_id",
        "guest checkouts cannot be followed over time",
        lambda df: df["Customer ID"].isna(),
    ),
    CleaningRule(
        "non_positive_price",
        "free samples, adjustments and data-entry errors",
        lambda df: ~(df["Price"] > 0),
    ),
    CleaningRule("zero_quantity", "lines that move no goods", lambda df: df["Quantity"] == 0),
    CleaningRule(
        "bad_debt_adjustment",
        "accounting entries (invoices prefixed A)",
        lambda df: df["Invoice"].str.startswith("A", na=False),
    ),
    CleaningRule(
        "non_product_code",
        "postage, fees, manual lines, vouchers (stock codes not starting with 5 digits)",
        lambda df: ~df["StockCode"].str.match(PRODUCT_CODE_PATTERN, na=False),
    ),
    CleaningRule(
        "inconsistent_return",
        "C-invoices with positive quantity or sales with negative quantity",
        lambda df: df["Invoice"].str.startswith("C", na=False) != (df["Quantity"] < 0),
    ),
    CleaningRule(
        "same_day_reversal",
        "an order cancelled the same day for the same product, price and quantity (mis-keys)",
        lambda df: same_day_reversals(df),
    ),
)


def same_day_reversals(df: pd.DataFrame) -> pd.Series:
    """Sale lines and the cancellations that reverse them the same day, matched one-to-one.

    Lines are grouped by customer, day, stock code, price and absolute quantity. Within a group,
    in time order, each cancellation reverses the earliest still-unmatched sale at or before it
    (a sale and a cancellation in the same minute count as sale first). A cancellation with no
    earlier sale that day returns an older order and is kept, as are returns on later days.
    """
    is_cancellation = df["Invoice"].str.startswith("C", na=False)
    key = pd.DataFrame(
        {
            "customer": df["Customer ID"],
            "day": df["InvoiceDate"].dt.normalize(),
            "stock": df["StockCode"],
            "price": df["Price"],
            "units": df["Quantity"].abs(),
        },
        index=df.index,
    )
    group = list(key.columns)
    has_sale = key.assign(n=~is_cancellation).groupby(group)["n"].transform("any")
    has_cancellation = key.assign(n=is_cancellation).groupby(group)["n"].transform("any")
    marked = pd.Series(False, index=df.index)
    candidates = key.loc[has_sale & has_cancellation].assign(
        when=df["InvoiceDate"], cancel=is_cancellation
    )
    if candidates.empty:
        return marked
    candidates = candidates.sort_values(["when", "cancel"], kind="stable")
    matched: list[Hashable] = []
    for _, lines in candidates.groupby(group, sort=False):
        open_sales: list[Hashable] = []
        for index, cancel in zip(lines.index, lines["cancel"], strict=True):
            if not cancel:
                open_sales.append(index)
            elif open_sales:
                matched += [open_sales.pop(0), index]
    return pd.Series(df.index.isin(matched), index=df.index)


def apply_rules(
    raw: pd.DataFrame, rules: tuple[CleaningRule, ...] = CLEANING_RULES
) -> tuple[pd.DataFrame, list[dict[str, object]]]:
    """Apply ``rules`` in order; return the kept raw lines and one audit record per rule."""
    df = raw
    steps: list[dict[str, object]] = []
    for rule in rules:
        drop = rule.drops(df)
        removed = df.loc[drop]
        steps.append(
            {
                "rule": rule.name,
                "reason": rule.reason,
                "rows_removed": int(drop.sum()),
                "revenue_removed": float((removed["Quantity"] * removed["Price"]).sum()),
            }
        )
        df = df.loc[~drop]
        steps[-1]["rows_remaining"] = len(df)
    return df, steps


def cleaning_audit(raw: pd.DataFrame) -> pd.DataFrame:
    """One row per rule, in application order: rows and revenue removed, rows remaining."""
    _, steps = apply_rules(raw)
    columns = ["rule", "reason", "rows_removed", "rows_remaining", "revenue_removed"]
    return pd.DataFrame(steps)[columns]


def clean_transactions(raw: pd.DataFrame) -> pd.DataFrame:
    df, _ = apply_rules(raw)
    out = pd.DataFrame(
        {
            "customer_id": df["Customer ID"].astype("int64"),
            "invoice": df["Invoice"].astype(str),
            "date": df["InvoiceDate"].dt.normalize().astype("datetime64[ns]"),
            "stock_code": df["StockCode"].astype(str),
            "quantity": df["Quantity"].astype("int64"),
            "price": df["Price"].astype("float64"),
            "revenue": (df["Quantity"] * df["Price"]).astype("float64"),
            "is_return": df["Invoice"].str.startswith("C", na=False).astype(bool),
            "country": df["Country"].astype(str),
        }
    )
    return TRANSACTIONS_SCHEMA.validate(out[TX_COLUMNS].reset_index(drop=True))
