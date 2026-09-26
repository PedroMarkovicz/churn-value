"""Raw invoice lines -> clean transaction table (one row per invoice line)."""

from __future__ import annotations

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


def clean_transactions(raw: pd.DataFrame) -> pd.DataFrame:
    df = raw.drop_duplicates()
    keep = (
        df["Customer ID"].notna()
        & (df["Price"] > 0)
        & (df["Quantity"] != 0)
        & df["StockCode"].str.match(PRODUCT_CODE_PATTERN, na=False)
        & ~df["Invoice"].str.startswith("A", na=False)
    )
    df = df.loc[keep]
    is_return = df["Invoice"].str.startswith("C", na=False)
    # A C-invoice with positive quantity (or a sale with negative quantity) is inconsistent.
    df = df.loc[is_return == (df["Quantity"] < 0)]
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
