import pandas as pd
import pandera.errors
import pytest

from churnvalue.data.clean import (
    CLEANING_RULES,
    TRANSACTIONS_SCHEMA,
    TX_COLUMNS,
    apply_rules,
    clean_transactions,
    cleaning_audit,
)


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


def test_cleaning_audit_counts_each_rule_in_order():
    raw = raw_rows(
        [
            ("489434", "85048", 12, "2009-12-01", 6.95, 13085.0, "United Kingdom"),
            ("489434", "85048", 12, "2009-12-01", 6.95, 13085.0, "United Kingdom"),
            ("489435", "85048", 1, "2009-12-01", 1.00, None, "United Kingdom"),
            ("489436", "POST", 1, "2009-12-01", 18.0, 12345.0, "France"),
        ]
    )
    audit = cleaning_audit(raw)
    assert audit["rule"].tolist()[:2] == ["exact_duplicates", "missing_customer_id"]
    by_rule = audit.set_index("rule")
    assert by_rule.loc["exact_duplicates", "rows_removed"] == 1
    assert by_rule.loc["missing_customer_id", "rows_removed"] == 1
    assert by_rule.loc["non_product_code", "rows_removed"] == 1
    assert by_rule.loc["non_product_code", "revenue_removed"] == pytest.approx(18.0)
    assert audit["rows_remaining"].iloc[-1] == len(clean_transactions(raw)) == 1


def test_same_day_reversal_removes_the_sale_and_its_cancellation():
    raw = raw_rows(
        [
            ("541431", "23166", 74215, "2011-01-18 10:01", 1.04, 12346.0, "United Kingdom"),
            ("C541433", "23166", -74215, "2011-01-18 10:17", 1.04, 12346.0, "United Kingdom"),
            ("541500", "85048", 5, "2011-01-18 11:00", 6.95, 12346.0, "United Kingdom"),
        ]
    )
    tx = clean_transactions(raw)
    assert tx["stock_code"].tolist() == ["85048"]
    assert cleaning_audit(raw).set_index("rule").loc["same_day_reversal", "rows_removed"] == 2


def test_same_day_reversal_matches_one_to_one_and_keeps_later_returns():
    raw = raw_rows(
        [
            ("500001", "85048", 3, "2011-02-01 09:00", 2.0, 13000.0, "United Kingdom"),
            ("500002", "85048", 3, "2011-02-01 12:00", 2.0, 13000.0, "United Kingdom"),
            ("C500003", "85048", -3, "2011-02-01 15:00", 2.0, 13000.0, "United Kingdom"),
            ("C500004", "85048", -3, "2011-02-20 15:00", 2.0, 13000.0, "United Kingdom"),
        ]
    )
    tx = clean_transactions(raw)
    # one sale + the same-day cancellation go; the other sale and the later return stay
    assert sorted(tx["quantity"].tolist()) == [-3, 3]
    assert tx.loc[tx["is_return"], "date"].tolist() == [pd.Timestamp("2011-02-20")]


def test_apply_rules_with_a_prefix_skips_later_rules():
    raw = raw_rows(
        [
            ("541431", "23166", 10, "2011-01-18 10:01", 1.0, 12346.0, "United Kingdom"),
            ("C541433", "23166", -10, "2011-01-18 10:17", 1.0, 12346.0, "United Kingdom"),
        ]
    )
    kept, steps = apply_rules(raw, CLEANING_RULES[:-1])
    assert len(kept) == 2
    assert [s["rule"] for s in steps][-1] == "inconsistent_return"
