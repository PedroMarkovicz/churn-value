import hashlib
import json
import re
from typing import Any

import numpy as np
import pandas as pd
import pytest

from churnvalue.contract import (
    CalibratorFile,
    CustomersFile,
    EvaluationFile,
    ExperimentsFile,
    FeatureSpec,
    Manifest,
    ModelGolden,
    TimelinesFile,
)
from churnvalue.evaluate import BASELINE_SCORERS, evaluate_models, supervised_scorer
from churnvalue.export import deployed_spec, export_artifacts, onnx_churn_probability
from churnvalue.model_card import render_model_card
from churnvalue.models import SUPERVISED, feature_matrix
from churnvalue.training import load_training

EXPERIMENTS: dict[str, Any] = {
    "experiment": "test",
    "runs": [
        {
            "run_id": "abc",
            "model": "lightgbm_seasonal",
            "started_at": "2026-09-26T12:00:00+00:00",
            "tags": {"git_sha": "unknown"},
            "params": {"num_leaves": "8"},
            "metrics": {"cv_log_loss": 0.5},
            "trial_cv_log_loss": [0.6, 0.5],
        }
    ],
}


@pytest.fixture(scope="module")
def exported(trained_synthetic, snapshots_synthetic: pd.DataFrame, tx_synthetic: pd.DataFrame):
    cfg, estimators = trained_synthetic
    scorers = {
        **BASELINE_SCORERS,
        **{n: supervised_scorer(estimators[n], s) for n, s in SUPERVISED.items()},
    }
    evaluation = evaluate_models(snapshots_synthetic, scorers, cfg)
    result = export_artifacts(
        cfg,
        snapshots_synthetic,
        tx_synthetic,
        scorers,
        estimators["lightgbm_seasonal"],
        evaluation,
        EXPERIMENTS,
    )
    return cfg, estimators, evaluation, result


def _read(cfg, name: str) -> str:
    return (cfg.artifacts_dir / name).read_text(encoding="utf-8")


def test_every_artifact_validates_against_the_contract(exported):
    cfg, _, _, result = exported
    models = {
        "customers.json": CustomersFile,
        "timelines.json": TimelinesFile,
        "evaluation.json": EvaluationFile,
        "experiments.json": ExperimentsFile,
        "feature_spec.json": FeatureSpec,
        "calibrator.json": CalibratorFile,
        "golden/model.json": ModelGolden,
    }
    for name, model in models.items():
        model.model_validate_json(_read(cfg, name))
    manifest = Manifest.model_validate_json(_read(cfg, "manifest.json"))
    assert manifest == result.manifest
    assert set(manifest.files) == {*models, "model.onnx"}


def test_manifest_checksums_match_the_files(exported):
    cfg, _, _, result = exported
    for name, digest in result.manifest.files.items():
        assert hashlib.sha256((cfg.artifacts_dir / name).read_bytes()).hexdigest() == digest


def test_onnx_matches_native_lightgbm_and_the_model_golden(exported, snapshots_synthetic):
    cfg, estimators, _, _ = exported
    spec = SUPERVISED["lightgbm_seasonal"]
    model = (cfg.artifacts_dir / "model.onnx").read_bytes()
    x = feature_matrix(snapshots_synthetic, spec)
    native = estimators[spec.name].predict_proba(x)[:, 1]
    assert np.abs(onnx_churn_probability(model, x) - native).max() < 1e-5
    golden = ModelGolden.model_validate_json(_read(cfg, "golden/model.json"))
    cases = np.array([c.features for c in golden.cases])
    scores = onnx_churn_probability(model, cases)
    assert scores == pytest.approx([c.score for c in golden.cases], abs=golden.tolerance)


def test_customers_carry_every_model_and_the_test_labels(exported, snapshots_synthetic):
    cfg, _, evaluation, _ = exported
    customers = CustomersFile.model_validate_json(_read(cfg, "customers.json"))
    test = snapshots_synthetic.loc[snapshots_synthetic["cutoff"] == "2011-09-10"]
    assert [c.customer_id for c in customers.customers] == test["customer_id"].tolist()
    assert [c.churn for c in customers.customers] == test["churn"].tolist()
    assert customers.models == list(evaluation["models"])
    first = customers.customers[0]
    assert list(first.features) == list(SUPERVISED["lightgbm_seasonal"].features)
    assert len(first.top_contributions) == 5


def test_timelines_stop_at_the_end_of_the_label_window(exported):
    cfg, _, _, _ = exported
    timelines = TimelinesFile.model_validate_json(_read(cfg, "timelines.json"))
    for timeline in timelines.timelines:
        assert timeline.days == sorted(timeline.days)
        assert max(timeline.days) <= timelines.horizon_days
        assert min(timeline.days) <= 0  # eligible customers bought before the cutoff
        assert len(timeline.revenue) == len(timeline.days)


def test_feature_spec_orders_inputs_like_the_model(exported):
    cfg, _, _, _ = exported
    spec = FeatureSpec.model_validate_json(_read(cfg, "feature_spec.json"))
    assert spec.order == list(SUPERVISED["lightgbm_seasonal"].features)
    assert [f.name for f in spec.features] == spec.order
    assert {f.name for f in spec.features if f.editable} == {
        f.name for f in spec.features if f.group == "base"
    }
    assert spec.context["cutoff_month_cos"] == pytest.approx(np.cos(2 * np.pi * 9 / 12))


def test_only_a_lightgbm_model_can_be_deployed(exported):
    cfg, _, _, _ = exported
    bad = cfg.model_copy(
        update={"training": cfg.training.model_copy(update={"deployed_model": "logreg"})}
    )
    with pytest.raises(ValueError, match="deployed_model"):
        deployed_spec(bad)


def test_model_card_renders_every_section_without_missing_values(exported):
    cfg, _, evaluation, result = exported
    card = render_model_card(
        result.manifest, evaluation, load_training(cfg.models_dir), result.importance
    )
    for heading in (
        "## Model details",
        "## Evaluation on the test cutoff",
        "## Business result at the default scenario",
        "## Calibration and profit across later cutoffs",
        "## What drives the score",
        "## Limitations and risks",
    ):
        assert heading in card
    assert re.search(r"\bnan\b", card, flags=re.IGNORECASE) is None
    assert json.dumps(evaluation, allow_nan=False)
