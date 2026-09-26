import pandas as pd
import pandera.errors
import pytest

from churnvalue.data.clean import TRANSACTIONS_SCHEMA, TX_COLUMNS, clean_transactions


def raw_rows(rows: list[tuple]) -> pd.DataFrame:
    cols = ["Invoice", "StockCode", "Quantity", "InvoiceDate", "Price", "Customer ID", "Country"]
    df = pd.DataFrame(rows, columns=cols)
    df["InvoiceDate"] = pd.to_datetime(df["InvoiceDate"]).astype("datetime64[us]")
    df["Description"] = "X"
    return df


def test_keeps_valid_sales_and_returns_and_computes_revenue():
    raw = raw_rows(
        [
            ("489434", "85048", 12, "2009-12-01 07:45", 6.95, 13085.0, "United Kingdom"),
            ("C489449", "22087", -12, "2009-12-01 10:33", 0.85, 16321.0, "Australia"),
        ]
    )
    tx = clean_transactions(raw)
    assert list(tx.columns) == TX_COLUMNS
    assert tx["revenue"].tolist() == pytest.approx([83.4, -10.2])
    assert tx["is_return"].tolist() == [False, True]
    assert tx["date"].tolist() == [pd.Timestamp("2009-12-01"), pd.Timestamp("2009-12-01")]
    assert tx["customer_id"].dtype == "int64"


@pytest.mark.parametrize(
    "row",
    [
        ("489434", "85048", 1, "2009-12-01", 1.0, None, "United Kingdom"),  # no customer
        ("489434", "POST", 1, "2009-12-01", 18.0, 12345.0, "France"),  # postage
        ("489434", "M", 1, "2009-12-01", 5.0, 12345.0, "France"),  # manual adjustment
        ("A506401", "B", 1, "2010-04-29", -53594.36, 12345.0, "United Kingdom"),  # bad debt
        ("489434", "85048", 1, "2009-12-01", 0.0, 12345.0, "United Kingdom"),  # zero price
        ("C489449", "22087", 5, "2009-12-01", 0.85, 12345.0, "United Kingdom"),  # C with qty > 0
    ],
)
def test_drops_non_customer_non_product_and_inconsistent_lines(row):
    assert clean_transactions(raw_rows([row])).empty


def test_drops_exact_duplicates():
    row = ("489434", "85048", 12, "2009-12-01 07:45", 6.95, 13085.0, "United Kingdom")
    assert len(clean_transactions(raw_rows([row, row]))) == 1


def test_schema_rejects_positive_revenue_return():
    tx = clean_transactions(
        raw_rows([("489434", "85048", 12, "2009-12-01", 6.95, 13085.0, "United Kingdom")])
    )
    tx.loc[0, "is_return"] = True
    with pytest.raises(pandera.errors.SchemaError):
        TRANSACTIONS_SCHEMA.validate(tx)
