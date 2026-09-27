"""Checks against the real pipeline outputs (run `train`, `evaluate`, `export` first)."""

import json
from pathlib import Path

import pytest

from churnvalue.contract import CustomersFile, EvaluationFile, Manifest

ROOT = Path(__file__).parents[1]


@pytest.mark.slow
def test_real_evaluation_backs_the_headline_claims():
    report = EvaluationFile.model_validate_json(
        (ROOT / "reports" / "evaluation.json").read_text(encoding="utf-8")
    )
    policies = {row.policy: row for row in report.policies}
    deployed = policies["lightgbm_seasonal"]
    # The deployed policy makes money with a CI above zero, and beats both baselines.
    assert deployed.realized_profit_ci_low > 0
    assert deployed.realized_profit > policies["lightgbm"].realized_profit
    assert deployed.realized_profit > policies["bgnbd"].realized_profit
    # Its mean probability on the test cutoff sits near the true churn rate.
    assert report.models["lightgbm_seasonal"].mean_p == pytest.approx(
        report.test_population.churn_rate, abs=0.03
    )
    # Without the month features the model stays at the calibration cutoff's churn rate.
    assert report.models["lightgbm"].mean_p == pytest.approx(
        report.calibration_population.churn_rate, abs=0.03
    )


@pytest.mark.slow
def test_real_artifacts_are_consistent():
    artifacts = ROOT / "artifacts"
    manifest = Manifest.model_validate_json((artifacts / "manifest.json").read_text("utf-8"))
    customers = CustomersFile.model_validate_json((artifacts / "customers.json").read_text("utf-8"))
    assert len(customers.customers) == 1920
    assert customers.deployed_model == manifest.deployed_model == "lightgbm_seasonal"
    assert json.loads((artifacts / "feature_spec.json").read_text("utf-8"))["order"][-1] == (
        "cutoff_month_cos"
    )
