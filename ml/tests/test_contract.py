import json
from pathlib import Path

import pandas as pd
import pytest
from pydantic import ValidationError

from churnvalue.btyd import GammaGammaParams, gamma_gamma_expected_aov
from churnvalue.config import load_config
from churnvalue.contract import SCHEMAS, CalibratorFile, Customer, schema_documents
from churnvalue.economics import customer_economics, expected_profit, value_at_risk
from churnvalue.features import add_derived_features
from churnvalue.golden import (
    derived_golden,
    economics_golden,
    gamma_gamma_golden,
    golden_documents,
)

ROOT = Path(__file__).parents[1]
CONTRACTS = ROOT.parent / "contracts"


def test_committed_schemas_match_the_pydantic_models():
    """Contract drift check: run `uv run churnvalue contracts` after changing contract.py."""
    for name, text in schema_documents().items():
        committed = (CONTRACTS / "schemas" / name).read_text(encoding="utf-8")
        assert committed == text, f"{name} is stale: run `uv run churnvalue contracts`"
    committed_names = {p.name for p in (CONTRACTS / "schemas").glob("*.schema.json")}
    assert committed_names == set(schema_documents())


def test_committed_golden_vectors_match_the_code():
    cfg = load_config(ROOT / "configs" / "default.yaml")
    for name, text in golden_documents(cfg.snapshots).items():
        committed = (CONTRACTS / "golden" / name).read_text(encoding="utf-8")
        assert committed == text, f"{name} is stale: run `uv run churnvalue contracts`"


def test_schemas_are_deterministic_json():
    first, second = schema_documents(), schema_documents()
    assert first == second
    assert set(first) == {f"{name}.schema.json" for name in SCHEMAS}
    for text in first.values():
        assert text.endswith("\n")
        json.loads(text)


def test_calibrator_file_is_a_tagged_union():
    platt = {"model": "m", "calibrator": {"method": "platt", "slope": 1.0, "intercept": 0.0}}
    assert CalibratorFile.model_validate(platt).calibrator.method == "platt"
    with pytest.raises(ValidationError):
        CalibratorFile.model_validate(
            {"model": "m", "calibrator": {"method": "platt", "x": [0.1], "y": [0.2]}}
        )


def test_customer_rejects_probabilities_outside_the_unit_interval():
    customer = {
        "customer_id": 1,
        "churn": 1,
        "p": {"m": 1.2},
        "features": {},
        "aov_gg": 10.0,
        "cadence_days": 30.0,
        "shap_baseline": 0.0,
        "top_contributions": [],
    }
    with pytest.raises(ValidationError):
        Customer.model_validate(customer)


def test_economics_golden_cases_are_self_consistent_and_cover_every_branch():
    golden = economics_golden()
    assert {case.contact for case in golden.cases} == {True, False}
    assert any(case.benefit < case.value for case in golden.cases)  # B = CAC regime
    assert any(case.benefit == case.value for case in golden.cases)  # B = V regime
    for case in golden.cases[:: len(golden.cases) // 25]:
        econ = customer_economics(
            value_at_risk([case.aov_gg], [case.cadence_days], case.params), case.params
        )
        assert econ.crc[0] == pytest.approx(case.crc, rel=golden.tolerance)
        assert expected_profit([case.p], econ, case.params)[0] == pytest.approx(
            case.expected_profit, rel=golden.tolerance, abs=1e-12
        )
    budget = golden.budget_cases
    assert any(case.budget == 0.0 and not any(case.selected) for case in budget)


def test_gamma_gamma_golden_matches_the_formula_and_shrinks_short_histories():
    golden = gamma_gamma_golden()
    for case in golden.cases:
        params = GammaGammaParams(case.params.p, case.params.q, case.params.v)
        aov = gamma_gamma_expected_aov(params, [case.n_purchase_days], [case.avg_order_value])
        assert aov[0] == pytest.approx(case.aov_gg, rel=golden.tolerance)
    one = [c for c in golden.cases if c.n_purchase_days == 1.0]
    many = [c for c in golden.cases if c.n_purchase_days == 150.0]
    # one purchase is pulled far towards the population mean, many purchases barely move
    assert all(abs(c.aov_gg - c.avg_order_value) / c.avg_order_value > 0.05 for c in one)
    assert all(abs(c.aov_gg - c.avg_order_value) / c.avg_order_value < 0.05 for c in many)


def test_derived_golden_includes_edge_customers():
    golden = derived_golden(horizon_days=90, cadence_floor_days=7.0)
    base = pd.DataFrame([case.base for case in golden.cases])
    derived = add_derived_features(base, 90, 7.0)
    for column in golden.cases[0].derived:
        expected = [case.derived[column] for case in golden.cases]
        assert derived[column].tolist() == pytest.approx(expected, rel=golden.tolerance)
    assert any(case.base["n_purchase_days"] == 1 for case in golden.cases)
    assert any(case.derived["cadence_days"] == 7.0 for case in golden.cases)
