import json
from pathlib import Path

import pandas as pd
import yaml
from typer.testing import CliRunner

from churnvalue.cli import app

DEFAULT = Path(__file__).parents[1] / "configs" / "default.yaml"


def _config(tmp_path: Path) -> Path:
    cfg = yaml.safe_load(DEFAULT.read_text(encoding="utf-8"))
    cfg["data"]["raw_dir"] = str(tmp_path / "raw")
    cfg["data"]["interim_dir"] = str(tmp_path / "interim")
    cfg["reports_dir"] = str(tmp_path / "reports")
    cfg["models_dir"] = str(tmp_path / "models")
    cfg["artifacts_dir"] = str(tmp_path / "artifacts")
    cfg["contracts_dir"] = str(tmp_path / "contracts")
    cfg["model_card_path"] = str(tmp_path / "docs" / "model-card.md")
    cfg["evaluation"]["n_bootstrap"] = 100
    cfg["tracking"]["uri"] = f"sqlite:///{(tmp_path / 'mlflow.db').as_posix()}"
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.safe_dump(cfg), encoding="utf-8")
    return config_path


def test_full_pipeline_from_raw_parquet_to_artifacts(tmp_path: Path, raw_synthetic: pd.DataFrame):
    config_path = _config(tmp_path)
    (tmp_path / "interim").mkdir()
    raw_synthetic.to_parquet(tmp_path / "interim" / "raw.parquet", index=False)
    runner = CliRunner()

    def run(*args: str):
        result = runner.invoke(app, [*args, "--config", str(config_path)])
        assert result.exit_code == 0, result.output
        return result

    run("build-snapshots")
    assert (tmp_path / "interim" / "snapshots.parquet").exists()

    baselines = run("evaluate-baselines")
    report = json.loads((tmp_path / "reports" / "baseline_evaluation.json").read_text("utf-8"))
    assert report["split"]["calibration"] == "2011-06-10"
    assert "oracle" in baselines.output

    trained = run("train", "--trials", "2")
    assert "lightgbm_seasonal" in trained.output
    assert (tmp_path / "models" / "training.json").exists()

    evaluated = run("evaluate")
    evaluation = json.loads((tmp_path / "reports" / "evaluation.json").read_text("utf-8"))
    assert list(evaluation["models"])[-1] == "lightgbm_seasonal"
    assert "lightgbm_seasonal" in evaluated.output

    run("export")
    manifest = json.loads((tmp_path / "artifacts" / "manifest.json").read_text("utf-8"))
    assert manifest["deployed_model"] == "lightgbm_seasonal"
    assert (tmp_path / "artifacts" / "model.onnx").exists()
    assert (tmp_path / "docs" / "model-card.md").read_text("utf-8").startswith("# Model card")

    run("contracts")
    assert len(list((tmp_path / "contracts" / "schemas").glob("*.schema.json"))) == 10
    assert (tmp_path / "contracts" / "golden" / "economics.json").exists()


def test_export_explains_the_missing_evaluation(tmp_path: Path):
    result = CliRunner().invoke(app, ["export", "--config", str(_config(tmp_path))])
    assert result.exit_code != 0
    assert "churnvalue evaluate" in result.output
