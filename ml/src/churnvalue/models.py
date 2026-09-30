"""Supervised rungs of the model ladder: feature sets, estimators and search spaces (ADR 0005)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

import lightgbm as lgb
import numpy as np
import optuna
import pandas as pd
from numpy.typing import NDArray
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, StandardScaler

from churnvalue.features import BASE_FEATURES, CONTEXT_FEATURES, DERIVED_FEATURES

Kind = Literal["logreg", "lightgbm"]
Family = Literal["rule", "probabilistic", "linear", "gbdt"]
FloatArray = NDArray[np.float64]

CUSTOMER_FEATURES: tuple[str, ...] = (*BASE_FEATURES, *DERIVED_FEATURES)
ALL_FEATURES: tuple[str, ...] = (*CUSTOMER_FEATURES, *CONTEXT_FEATURES)
# Heavy-tailed, non-negative features: the logistic regression sees log1p of them.
LOG1P_FEATURES = frozenset(
    {
        "recency_days",
        "n_purchase_days",
        "tenure_days",
        "total_spend",
        "avg_order_value",
        "n_distinct_products",
        "spend_90d",
        "spend_prev_90d",
        "purchases_90d",
        "cadence_days",
        "overdue_ratio",
        "expected_purchases_h",
        "spend_trend",
    }
)
# Settings that make LightGBM reproducible run to run; not tuned.
LIGHTGBM_FIXED: dict[str, Any] = {
    "subsample_freq": 1,
    "deterministic": True,
    "force_row_wise": True,
    "n_jobs": 4,
    "verbose": -1,
}


@dataclass(frozen=True)
class ModelSpec:
    name: str
    kind: Kind
    features: tuple[str, ...]


@dataclass(frozen=True)
class LadderEntry:
    """How a rung is presented: the web app reads these through the manifest (contract 1.1.0)."""

    name: str
    label: str
    family: Family


# Every rung, in evaluation order: the baselines first, then the supervised models.
LADDER: dict[str, LadderEntry] = {
    entry.name: entry
    for entry in (
        LadderEntry("cadence_rule", "Cadence rule", "rule"),
        LadderEntry("bgnbd", "BG/NBD", "probabilistic"),
        LadderEntry("logreg", "Logistic regression", "linear"),
        LadderEntry("lightgbm", "LightGBM", "gbdt"),
        LadderEntry("lightgbm_seasonal", "LightGBM + season", "gbdt"),
    )
}

SUPERVISED: dict[str, ModelSpec] = {
    spec.name: spec
    for spec in (
        ModelSpec("logreg", "logreg", ALL_FEATURES),
        ModelSpec("lightgbm", "lightgbm", CUSTOMER_FEATURES),
        ModelSpec("lightgbm_seasonal", "lightgbm", ALL_FEATURES),
    )
}


def log1p_columns(features: tuple[str, ...]) -> list[int]:
    return [i for i, name in enumerate(features) if name in LOG1P_FEATURES]


def log1p_selected(x: FloatArray, columns: list[int]) -> FloatArray:
    """log1p of the selected columns (clipped at 0); module-level so fitted models pickle."""
    out = np.array(x, dtype=np.float64)  # copy: never mutate the caller's matrix
    out[:, columns] = np.log1p(np.clip(out[:, columns], 0.0, None))
    return out


def make_estimator(spec: ModelSpec, params: dict[str, Any], seed: int) -> Any:
    """An unfitted scikit-learn-compatible classifier for ``spec`` with tuned ``params``."""
    if spec.kind == "logreg":
        return Pipeline(
            [
                (
                    "log1p",
                    FunctionTransformer(
                        log1p_selected, kw_args={"columns": log1p_columns(spec.features)}
                    ),
                ),
                ("scale", StandardScaler()),
                ("model", LogisticRegression(C=params["C"], max_iter=5_000)),
            ]
        )
    return lgb.LGBMClassifier(**params, **LIGHTGBM_FIXED, random_state=seed)


def suggest_params(spec: ModelSpec, trial: optuna.Trial) -> dict[str, Any]:
    """Optuna search space per model kind."""
    if spec.kind == "logreg":
        return {"C": trial.suggest_float("C", 1e-3, 10.0, log=True)}
    return {
        "n_estimators": trial.suggest_int("n_estimators", 100, 800, step=50),
        "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.1, log=True),
        "num_leaves": trial.suggest_int("num_leaves", 4, 48, log=True),
        "min_child_samples": trial.suggest_int("min_child_samples", 20, 400, log=True),
        "subsample": trial.suggest_float("subsample", 0.5, 1.0),
        "colsample_bytree": trial.suggest_float("colsample_bytree", 0.4, 1.0),
        "reg_lambda": trial.suggest_float("reg_lambda", 1e-3, 30.0, log=True),
    }


def feature_matrix(frame: pd.DataFrame, spec: ModelSpec) -> FloatArray:
    """The model input, float64, in ``spec.features`` order (the ONNX input order too)."""
    return frame.loc[:, list(spec.features)].to_numpy(dtype=np.float64)


def predict_churn(estimator: Any, frame: pd.DataFrame, spec: ModelSpec) -> FloatArray:
    """Uncalibrated churn score in [0, 1] (the class-1 probability of the fitted estimator)."""
    return np.asarray(estimator.predict_proba(feature_matrix(frame, spec))[:, 1], dtype=np.float64)
