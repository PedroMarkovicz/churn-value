from pathlib import Path

import joblib
import numpy as np
import optuna
import pandas as pd

from churnvalue.features import BASE_FEATURES, CONTEXT_FEATURES, DERIVED_FEATURES
from churnvalue.models import (
    ALL_FEATURES,
    CUSTOMER_FEATURES,
    SUPERVISED,
    feature_matrix,
    log1p_selected,
    make_estimator,
    predict_churn,
    suggest_params,
)


def test_ladder_feature_sets_differ_only_by_context():
    assert (*BASE_FEATURES, *DERIVED_FEATURES, *CONTEXT_FEATURES) == ALL_FEATURES
    assert SUPERVISED["lightgbm"].features == CUSTOMER_FEATURES
    assert SUPERVISED["lightgbm_seasonal"].features == ALL_FEATURES
    assert SUPERVISED["logreg"].features == ALL_FEATURES
    assert list(SUPERVISED) == ["logreg", "lightgbm", "lightgbm_seasonal"]


def test_log1p_selected_transforms_a_copy_and_clips_negatives():
    x = np.array([[0.0, -5.0, 3.0], [np.e - 1, 2.0, 4.0]])
    out = log1p_selected(x, [0, 1])
    assert np.allclose(out[:, 0], [0.0, 1.0])
    assert out[0, 1] == 0.0  # clipped at 0 before log1p
    assert np.array_equal(out[:, 2], x[:, 2])
    assert x[0, 1] == -5.0  # the input is untouched


def test_feature_matrix_follows_spec_order(snapshots_synthetic: pd.DataFrame):
    spec = SUPERVISED["lightgbm_seasonal"]
    shuffled = snapshots_synthetic[list(reversed(spec.features))]
    x = feature_matrix(shuffled, spec)
    assert x.shape == (len(shuffled), len(spec.features))
    assert np.array_equal(x[:, 0], shuffled[spec.features[0]].to_numpy(dtype=np.float64))


def test_every_estimator_fits_predicts_and_pickles(
    snapshots_synthetic: pd.DataFrame, tmp_path: Path
):
    frame = snapshots_synthetic
    y = frame["churn"].to_numpy()
    for spec in SUPERVISED.values():
        params = suggest_params(spec, optuna.trial.FixedTrial(_first_values(spec.kind)))
        estimator = make_estimator(spec, params, seed=0).fit(feature_matrix(frame, spec), y)
        scores = predict_churn(estimator, frame, spec)
        assert scores.shape == (len(frame),)
        assert ((scores >= 0) & (scores <= 1)).all()
        path = tmp_path / f"{spec.name}.joblib"
        joblib.dump(estimator, path)
        assert np.array_equal(predict_churn(joblib.load(path), frame, spec), scores)


def _first_values(kind: str) -> dict[str, float]:
    if kind == "logreg":
        return {"C": 0.1}
    return {
        "n_estimators": 100,
        "learning_rate": 0.05,
        "num_leaves": 8,
        "min_child_samples": 20,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "reg_lambda": 1.0,
    }
