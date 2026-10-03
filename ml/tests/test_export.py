import hashlib
import json
import re
from typing import Any

import numpy as np
import pandas as pd
import pytest

from churnvalue.btyd import GammaGammaParams, gamma_gamma_expected_aov
from churnvalue.contract import (
    CalibratorFile,
    CustomersFile,
    EvaluationFile,
    ExperimentsFile,
    FeatureSpec,
    Manifest,
    ModelGolden,
    PipelineInfo,
    TimelinesFile,
)
from churnvalue.evaluate import BASELINE_SCORERS, evaluate_models, supervised_scorer
from churnvalue.export import (
    MODEL_CARD_FILE,
    deployed_spec,
    export_artifacts,
    ladder_info,
    onnx_churn_probability,
    pipeline_info,
    served_gamma_gamma,
)
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
    assert set(manifest.files) == {*models, "model.onnx", MODEL_CARD_FILE}


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
        result.manifest, result.evaluation, load_training(cfg.models_dir), result.importance
    )
    for heading in (
        "## Model details",
        "## Evaluation on the test cutoff",
        "## Business result at the default scenario",
        "## Calibration and profit across later cutoffs",
        "## Value estimate",
        "## What drives the score",
        "## Limitations and risks",
    ):
        assert heading in card
    assert re.search(r"\bnan\b", card, flags=re.IGNORECASE) is None
    assert json.dumps(evaluation, allow_nan=False)


def test_manifest_describes_every_model_in_ladder_order(exported):
    cfg, _, evaluation, result = exported
    customers = CustomersFile.model_validate_json(_read(cfg, "customers.json"))
    names = [info.name for info in result.manifest.models]
    assert names == customers.models == list(evaluation["models"])
    deployable = [info.name for info in result.manifest.models if info.deployable]
    assert deployable == [result.manifest.deployed_model]


def test_served_gamma_gamma_reproduces_every_customers_aov(exported):
    cfg, _, _, _ = exported
    spec = FeatureSpec.model_validate_json(_read(cfg, "feature_spec.json"))
    customers = CustomersFile.model_validate_json(_read(cfg, "customers.json"))
    params = GammaGammaParams(spec.gamma_gamma.p, spec.gamma_gamma.q, spec.gamma_gamma.v)
    n = [c.features["n_purchase_days"] for c in customers.customers]
    m = [c.features["avg_order_value"] for c in customers.customers]
    served = [c.aov_gg for c in customers.customers]
    assert gamma_gamma_expected_aov(params, n, m) == pytest.approx(served, rel=1e-9)


def test_served_evaluation_carries_the_value_backtest(exported):
    cfg, _, _, _ = exported
    evaluation = EvaluationFile.model_validate_json(_read(cfg, "evaluation.json"))
    assert evaluation.value_check is not None
    assert [row.bucket for row in evaluation.value_check] == ["2", "3", "4-5", "6-10", "11+"]
    assert sum(row.n for row in evaluation.value_check) == round(
        evaluation.test_population.n_customers * (1 - evaluation.test_population.churn_rate)
    )


def test_export_refuses_a_model_without_ladder_metadata():
    with pytest.raises(ValueError, match="LADDER"):
        ladder_info(["cadence_rule", "xgboost"], "cadence_rule")


def test_export_refuses_gamma_gamma_parameters_that_do_not_reproduce_aov(snapshots_synthetic):
    test = snapshots_synthetic.loc[snapshots_synthetic["cutoff"] == "2011-09-10"].copy()
    test["gg_v"] *= 1.01
    with pytest.raises(RuntimeError, match="Gamma-Gamma"):
        served_gamma_gamma(test)


def test_feature_ranges_cover_every_served_customer(exported):
    """The web app's sliders use these ranges; a served customer must never fall outside."""
    cfg, _, _, _ = exported
    spec = FeatureSpec.model_validate_json(_read(cfg, "feature_spec.json"))
    customers = CustomersFile.model_validate_json(_read(cfg, "customers.json"))
    for entry in spec.features:
        values = [c.features[entry.name] for c in customers.customers]
        assert entry.min <= min(values), entry.name
        assert max(values) <= entry.max, entry.name


def test_export_refuses_when_onnx_and_native_disagree(
    exported, snapshots_synthetic, tx_synthetic, monkeypatch, tmp_path
):
    cfg, estimators, evaluation, _ = exported
    fresh = cfg.model_copy(update={"artifacts_dir": tmp_path / "artifacts"})
    scorers = {
        **BASELINE_SCORERS,
        **{n: supervised_scorer(estimators[n], s) for n, s in SUPERVISED.items()},
    }
    monkeypatch.setattr(
        "churnvalue.export.onnx_churn_probability", lambda model, x: np.full(len(x), 0.5)
    )
    with pytest.raises(RuntimeError, match="ONNX"):
        export_artifacts(
            fresh,
            snapshots_synthetic,
            tx_synthetic,
            scorers,
            estimators["lightgbm_seasonal"],
            evaluation,
            EXPERIMENTS,
        )
    assert not fresh.artifacts_dir.exists()  # nothing written, not even a partial set


def test_the_model_card_ships_with_the_artifacts_it_describes(exported):
    cfg, _, _, result = exported
    card = (cfg.artifacts_dir / MODEL_CARD_FILE).read_text("utf-8")
    assert card == result.model_card
    assert card.startswith("# Model card")
    # its provenance line names this run, not another one
    assert f"code `{result.manifest.git_sha}`" in card
    assert f"contract {result.manifest.contract_version}" in card


def test_manifest_records_how_the_run_was_built(exported):
    cfg, _, _, result = exported
    trained = load_training(cfg.models_dir)[result.manifest.deployed_model]
    assert result.manifest.pipeline == PipelineInfo(
        seed=cfg.training.seed,
        n_trials=len(trained["trial_values"]),
        n_folds=len(trained["folds"]),
        horizon_days=cfg.snapshots.horizon_days,
        eligibility_f=cfg.snapshots.eligibility_f,
    )
    assert pipeline_info(cfg, trained) == result.manifest.pipeline


def test_a_1_1_manifest_without_the_new_fields_still_validates():
    manifest = {
        "contract_version": "1.1.0",
        "created_at": "2026-09-30T00:00:00Z",
        "git_sha": "0" * 40,
        "data_sha256": "0" * 64,
        "config_sha256": "0" * 64,
        "deployed_model": "lightgbm_seasonal",
        "test_cutoff": "2011-09-10",
        "models": [
            {"name": "lightgbm_seasonal", "label": "L", "family": "gbdt", "deployable": True}
        ],
        "files": {},
    }
    assert Manifest.model_validate(manifest).pipeline is None
