"""Tune under rolling-origin CV, then fit each supervised model on the training cutoffs."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import optuna
import pandas as pd
from sklearn.metrics import log_loss

from churnvalue.metrics import pr_auc, roc_auc
from churnvalue.models import (
    ModelSpec,
    feature_matrix,
    make_estimator,
    predict_churn,
    suggest_params,
)

Fold = tuple[tuple[pd.Timestamp, ...], pd.Timestamp]
TRAINING_FILE = "training.json"


@dataclass(frozen=True)
class FoldResult:
    validation_cutoff: str
    n_fit_cutoffs: int
    n_validation: int
    churn_rate: float
    mean_score: float
    log_loss: float
    roc_auc: float
    pr_auc: float


@dataclass(frozen=True)
class TrainingResult:
    name: str
    features: tuple[str, ...]
    params: dict[str, Any]
    cv_log_loss: float
    folds: tuple[FoldResult, ...]
    trial_values: tuple[float, ...]  # mean CV log loss of every Optuna trial, in trial order
    run_id: str | None = None  # MLflow run, filled in by the train stage


def rows_at(snapshots: pd.DataFrame, cutoffs: tuple[pd.Timestamp, ...]) -> pd.DataFrame:
    return snapshots.loc[snapshots["cutoff"].isin(cutoffs)]


def fit_estimator(spec: ModelSpec, params: dict[str, Any], frame: pd.DataFrame, seed: int) -> Any:
    estimator = make_estimator(spec, params, seed)
    estimator.fit(feature_matrix(frame, spec), frame["churn"].to_numpy(dtype=np.int64))
    return estimator


def cross_validate(
    spec: ModelSpec,
    params: dict[str, Any],
    snapshots: pd.DataFrame,
    folds: list[Fold],
    seed: int,
) -> list[FoldResult]:
    """Fit on each fold's cutoffs, score its validation cutoff (labels never overlap)."""
    results = []
    for fit_cutoffs, validation in folds:
        estimator = fit_estimator(spec, params, rows_at(snapshots, fit_cutoffs), seed)
        held_out = rows_at(snapshots, (validation,))
        y = held_out["churn"].to_numpy(dtype=np.float64)
        score = predict_churn(estimator, held_out, spec)
        results.append(
            FoldResult(
                validation_cutoff=validation.date().isoformat(),
                n_fit_cutoffs=len(fit_cutoffs),
                n_validation=int(y.size),
                churn_rate=float(y.mean()),
                mean_score=float(score.mean()),
                log_loss=float(log_loss(y, score, labels=[0, 1])),
                roc_auc=roc_auc(y, score),
                pr_auc=pr_auc(y, score),
            )
        )
    return results


def tune(
    spec: ModelSpec, snapshots: pd.DataFrame, folds: list[Fold], n_trials: int, seed: int
) -> tuple[dict[str, Any], list[float]]:
    """Minimise mean rolling-origin log loss (a proper scoring rule: ranking and calibration)."""

    def objective(trial: optuna.Trial) -> float:
        params = suggest_params(spec, trial)
        return float(
            np.mean([f.log_loss for f in cross_validate(spec, params, snapshots, folds, seed)])
        )

    optuna.logging.set_verbosity(optuna.logging.WARNING)
    study = optuna.create_study(direction="minimize", sampler=optuna.samplers.TPESampler(seed=seed))
    study.optimize(objective, n_trials=n_trials)
    values = [float(t.value) for t in study.trials if t.value is not None]
    return dict(study.best_params), values


def train_model(
    spec: ModelSpec,
    snapshots: pd.DataFrame,
    train_cutoffs: tuple[pd.Timestamp, ...],
    folds: list[Fold],
    n_trials: int,
    seed: int,
) -> tuple[Any, TrainingResult]:
    """Tune, record the tuned CV folds, and refit on every training cutoff."""
    params, trial_values = tune(spec, snapshots, folds, n_trials, seed)
    fold_results = cross_validate(spec, params, snapshots, folds, seed)
    estimator = fit_estimator(spec, params, rows_at(snapshots, train_cutoffs), seed)
    result = TrainingResult(
        name=spec.name,
        features=spec.features,
        params=params,
        cv_log_loss=float(np.mean([f.log_loss for f in fold_results])),
        folds=tuple(fold_results),
        trial_values=tuple(trial_values),
    )
    return estimator, result


def save_models(
    models_dir: Path, estimators: dict[str, Any], results: dict[str, TrainingResult]
) -> None:
    models_dir.mkdir(parents=True, exist_ok=True)
    for name, estimator in estimators.items():
        joblib.dump(estimator, models_dir / f"{name}.joblib")
    payload = {name: asdict(result) for name, result in results.items()}
    (models_dir / TRAINING_FILE).write_text(
        json.dumps(payload, indent=2, allow_nan=False), encoding="utf-8"
    )


def load_estimator(models_dir: Path, name: str) -> Any:
    path = models_dir / f"{name}.joblib"
    if not path.is_file():
        raise FileNotFoundError(f"{path} not found: run `churnvalue train` first")
    return joblib.load(path)


def load_training(models_dir: Path) -> dict[str, dict[str, Any]]:
    path = models_dir / TRAINING_FILE
    if not path.is_file():
        raise FileNotFoundError(f"{path} not found: run `churnvalue train` first")
    return json.loads(path.read_text(encoding="utf-8"))
