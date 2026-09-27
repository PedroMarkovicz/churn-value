from pathlib import Path

from churnvalue.config import TrackingConfig
from churnvalue.contract import ExperimentsFile
from churnvalue.tracking import export_experiments, log_test_metrics, log_training
from churnvalue.training import FoldResult, TrainingResult

RESULT = TrainingResult(
    name="lightgbm",
    features=("a", "b"),
    params={"num_leaves": 8, "learning_rate": 0.05},
    cv_log_loss=0.61,
    folds=(
        FoldResult("2010-11-10", 3, 100, 0.4, 0.41, 0.62, 0.70, 0.55),
        FoldResult("2010-12-10", 4, 110, 0.3, 0.33, 0.60, 0.72, 0.50),
    ),
    trial_values=(0.70, 0.64, 0.61),
)


def test_runs_roundtrip_through_mlflow(tmp_path: Path):
    tracking = TrackingConfig(
        uri=f"sqlite:///{(tmp_path / 'mlflow.db').as_posix()}", experiment="test"
    )
    run_id = log_training(tracking, RESULT, {"git_sha": "abc123"})
    log_test_metrics(tracking, run_id, {"roc_auc": 0.77, "realized_profit": 23_139.0})

    exported = export_experiments(tracking)
    ExperimentsFile.model_validate(exported)
    (run,) = exported["runs"]
    assert run["run_id"] == run_id
    assert run["model"] == "lightgbm"
    assert run["tags"] == {"model": "lightgbm", "git_sha": "abc123"}
    assert run["params"]["num_leaves"] == "8"
    assert run["metrics"]["cv_log_loss"] == 0.61
    assert run["metrics"]["test_realized_profit"] == 23_139.0
    assert run["trial_cv_log_loss"] == [0.70, 0.64, 0.61]


def test_export_of_an_empty_experiment_has_no_runs(tmp_path: Path):
    tracking = TrackingConfig(
        uri=f"sqlite:///{(tmp_path / 'mlflow.db').as_posix()}", experiment="empty"
    )
    assert export_experiments(tracking) == {"experiment": "empty", "runs": []}
