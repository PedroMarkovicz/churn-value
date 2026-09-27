"""Local MLflow tracking, and the experiments summary the site shows (ADR 0008)."""

from __future__ import annotations

import os
from datetime import UTC, datetime
from typing import Any

from churnvalue.config import TrackingConfig
from churnvalue.training import TrainingResult

os.environ.setdefault("MLFLOW_DISABLE_AGENT_HINT", "1")  # keep CLI output clean

import mlflow  # noqa: E402  (after the environment tweak above)
from mlflow.tracking import MlflowClient  # noqa: E402

TRIAL_METRIC = "trial_cv_log_loss"


def _experiment_id(tracking: TrackingConfig) -> str:
    mlflow.set_tracking_uri(tracking.uri)
    return mlflow.set_experiment(tracking.experiment).experiment_id


def log_training(tracking: TrackingConfig, result: TrainingResult, tags: dict[str, str]) -> str:
    """One run per trained model: tuned params, CV folds and the Optuna history. Returns its id."""
    experiment_id = _experiment_id(tracking)
    with mlflow.start_run(experiment_id=experiment_id, run_name=result.name) as run:
        mlflow.set_tags({"model": result.name, **tags})
        mlflow.log_params({**result.params, "n_features": len(result.features)})
        mlflow.log_metric("cv_log_loss", result.cv_log_loss)
        for step, fold in enumerate(result.folds):
            mlflow.log_metric("fold_log_loss", fold.log_loss, step=step)
            mlflow.log_metric("fold_roc_auc", fold.roc_auc, step=step)
            mlflow.log_metric("fold_pr_auc", fold.pr_auc, step=step)
        for step, value in enumerate(result.trial_values):
            mlflow.log_metric(TRIAL_METRIC, value, step=step)
        return run.info.run_id


def log_test_metrics(tracking: TrackingConfig, run_id: str, metrics: dict[str, float]) -> None:
    """Attach held-out results to the model's training run."""
    mlflow.set_tracking_uri(tracking.uri)
    with mlflow.start_run(run_id=run_id):
        mlflow.log_metrics({f"test_{key}": value for key, value in metrics.items()})


def export_experiments(tracking: TrackingConfig) -> dict[str, Any]:
    """Every run of the experiment, newest first: params, final metrics and the trial history."""
    experiment_id = _experiment_id(tracking)
    client = MlflowClient(tracking_uri=tracking.uri)
    runs = client.search_runs([experiment_id], order_by=["attributes.start_time DESC"])
    exported = []
    for run in runs:
        history = client.get_metric_history(run.info.run_id, TRIAL_METRIC)
        exported.append(
            {
                "run_id": run.info.run_id,
                "model": run.data.tags.get("model", run.info.run_name),
                "started_at": datetime.fromtimestamp(run.info.start_time / 1000, UTC).isoformat(),
                "tags": {k: v for k, v in run.data.tags.items() if not k.startswith("mlflow.")},
                "params": dict(run.data.params),
                "metrics": dict(run.data.metrics),
                "trial_cv_log_loss": [m.value for m in sorted(history, key=lambda m: m.step)],
            }
        )
    return {"experiment": tracking.experiment, "runs": exported}
