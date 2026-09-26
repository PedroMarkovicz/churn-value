import json
from pathlib import Path

import pandas as pd
import yaml
from typer.testing import CliRunner

from churnvalue.cli import app

DEFAULT = Path(__file__).parents[1] / "configs" / "default.yaml"


def test_build_snapshots_then_evaluate_baselines(tmp_path: Path, raw_synthetic: pd.DataFrame):
    cfg = yaml.safe_load(DEFAULT.read_text(encoding="utf-8"))
    cfg["data"]["raw_dir"] = str(tmp_path / "raw")
    cfg["data"]["interim_dir"] = str(tmp_path / "interim")
    cfg["reports_dir"] = str(tmp_path / "reports")
    cfg["evaluation"]["n_bootstrap"] = 100
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.safe_dump(cfg), encoding="utf-8")
    (tmp_path / "interim").mkdir()
    raw_synthetic.to_parquet(tmp_path / "interim" / "raw.parquet", index=False)

    runner = CliRunner()
    built = runner.invoke(app, ["build-snapshots", "--config", str(config_path)])
    assert built.exit_code == 0, built.output
    assert (tmp_path / "interim" / "snapshots.parquet").exists()

    evaluated = runner.invoke(app, ["evaluate-baselines", "--config", str(config_path)])
    assert evaluated.exit_code == 0, evaluated.output
    report = json.loads((tmp_path / "reports" / "baseline_evaluation.json").read_text("utf-8"))
    assert report["split"]["calibration"] == "2011-06-10"
    assert "oracle" in evaluated.output
