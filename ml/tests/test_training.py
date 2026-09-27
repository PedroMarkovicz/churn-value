from pathlib import Path

import numpy as np
import pandas as pd
import pytest

import churnvalue.training as training
from churnvalue.models import SUPERVISED
from churnvalue.splits import make_temporal_split, rolling_origin_folds
from churnvalue.training import (
    cross_validate,
    load_estimator,
    load_training,
    models_fingerprint,
    rows_at,
    save_models,
    train_model,
    tune,
)

LOGREG = SUPERVISED["logreg"]


def _split_and_folds(snapshots: pd.DataFrame):
    cutoffs = sorted(pd.to_datetime(snapshots["cutoff"].unique()))
    split = make_temporal_split(cutoffs, 90, 3)
    return split, rolling_origin_folds(split.train, 90)


def test_cross_validate_reports_each_validation_cutoff(snapshots_synthetic: pd.DataFrame):
    _, folds = _split_and_folds(snapshots_synthetic)
    results = cross_validate(LOGREG, {"C": 0.1}, snapshots_synthetic, folds, seed=0)
    assert [r.validation_cutoff for r in results] == [v.date().isoformat() for _, v in folds]
    for result, (fit, validation) in zip(results, folds, strict=True):
        assert result.n_fit_cutoffs == len(fit)
        assert result.n_validation == len(rows_at(snapshots_synthetic, (validation,)))
        assert 0 < result.log_loss < 5
        assert 0 <= result.roc_auc <= 1


def test_cross_validate_fits_only_on_cutoffs_whose_labels_closed(
    snapshots_synthetic: pd.DataFrame, monkeypatch: pytest.MonkeyPatch
):
    # Record the cutoffs each fit sees; none may have a label window reaching validation.
    seen: list[set[pd.Timestamp]] = []
    original = training.fit_estimator

    def spy(spec, params, frame, seed):
        seen.append(set(pd.to_datetime(frame["cutoff"].unique())))
        return original(spec, params, frame, seed)

    monkeypatch.setattr(training, "fit_estimator", spy)
    _, folds = _split_and_folds(snapshots_synthetic)
    cross_validate(LOGREG, {"C": 0.1}, snapshots_synthetic, folds, seed=0)
    assert len(seen) == len(folds)
    for fit_cutoffs, (_, validation) in zip(seen, folds, strict=True):
        assert validation not in fit_cutoffs
        assert all(c + pd.Timedelta(days=90) <= validation for c in fit_cutoffs)


def test_tune_is_reproducible_with_a_seed(snapshots_synthetic: pd.DataFrame):
    _, folds = _split_and_folds(snapshots_synthetic)
    first = tune(LOGREG, snapshots_synthetic, folds, n_trials=3, seed=7)
    second = tune(LOGREG, snapshots_synthetic, folds, n_trials=3, seed=7)
    assert first == second
    assert len(first[1]) == 3


def test_train_model_records_tuned_folds_and_refits(snapshots_synthetic: pd.DataFrame):
    split, folds = _split_and_folds(snapshots_synthetic)
    estimator, result = train_model(
        SUPERVISED["lightgbm"], snapshots_synthetic, split.train, folds, n_trials=2, seed=0
    )
    assert result.cv_log_loss == pytest.approx(np.mean([f.log_loss for f in result.folds]))
    assert len(result.trial_values) == 2
    assert min(result.trial_values) == pytest.approx(result.cv_log_loss)
    assert estimator.n_features_in_ == len(SUPERVISED["lightgbm"].features)


def test_save_and_load_roundtrip(trained_synthetic, snapshots_synthetic: pd.DataFrame):
    cfg, estimators = trained_synthetic
    training = load_training(cfg.models_dir)
    assert set(training) == set(SUPERVISED)
    assert training["logreg"]["features"] == list(SUPERVISED["logreg"].features)
    reloaded = load_estimator(cfg.models_dir, "lightgbm_seasonal")
    spec = SUPERVISED["lightgbm_seasonal"]
    x = snapshots_synthetic[list(spec.features)].to_numpy(dtype=np.float64)
    assert np.array_equal(reloaded.predict_proba(x), estimators[spec.name].predict_proba(x))


def test_missing_models_explain_how_to_create_them(tmp_path: Path):
    with pytest.raises(FileNotFoundError, match="churnvalue train"):
        load_estimator(tmp_path, "lightgbm")
    with pytest.raises(FileNotFoundError, match="churnvalue train"):
        load_training(tmp_path)


def test_save_models_writes_strict_json(tmp_path: Path, trained_synthetic):
    cfg, _ = trained_synthetic
    text = (cfg.models_dir / "training.json").read_text(encoding="utf-8")
    assert "NaN" not in text
    save_models(tmp_path, {}, {})
    assert (tmp_path / "training.json").read_text(encoding="utf-8") == "{}"


def test_models_fingerprint_changes_with_any_model_file(tmp_path: Path, trained_synthetic):
    cfg, _ = trained_synthetic
    first = models_fingerprint(cfg.models_dir)
    assert first == models_fingerprint(cfg.models_dir)
    copy = tmp_path / "models"
    copy.mkdir()
    for path in cfg.models_dir.iterdir():
        (copy / path.name).write_bytes(path.read_bytes())
    assert models_fingerprint(copy) == first
    (copy / "lightgbm.joblib").write_bytes(b"retrained")
    assert models_fingerprint(copy) != first
