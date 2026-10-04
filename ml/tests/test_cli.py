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

    # Retraining after `evaluate` makes the report stale: export must refuse, not mix them.
    training_json = tmp_path / "models" / "training.json"
    training_json.write_text(training_json.read_text("utf-8") + " ", encoding="utf-8")
    stale = runner.invoke(app, ["export", "--config", str(config_path)])
    assert stale.exit_code == 1
    assert "churnvalue evaluate" in stale.output

    run("contracts")
    assert len(list((tmp_path / "contracts" / "schemas").glob("*.schema.json"))) == 11
    assert (tmp_path / "contracts" / "golden" / "economics.json").exists()
    assert (tmp_path / "contracts" / "golden" / "gamma_gamma.json").exists()


def test_export_explains_the_missing_evaluation(tmp_path: Path):
    result = CliRunner().invoke(app, ["export", "--config", str(_config(tmp_path))])
    assert result.exit_code != 0
    assert "churnvalue evaluate" in result.output


def test_stages_run_too_early_say_which_command_to_run(
    tmp_path: Path, snapshots_synthetic: pd.DataFrame
):
    config_path = _config(tmp_path)
    runner = CliRunner()

    def run(command: str):
        return runner.invoke(app, [command, "--config", str(config_path)])

    # No snapshots yet: training cannot start.
    too_early = run("train")
    assert too_early.exit_code == 1
    assert "churnvalue build-snapshots" in too_early.output
    assert not isinstance(too_early.exception, FileNotFoundError)  # a message, not a traceback

    # Snapshots but no models: evaluation cannot start.
    (tmp_path / "interim").mkdir()
    snapshots_synthetic.to_parquet(tmp_path / "interim" / "snapshots.parquet", index=False)
    no_models = run("evaluate")
    assert no_models.exit_code == 1
    assert "churnvalue train" in no_models.output
    assert not isinstance(no_models.exception, FileNotFoundError)


def test_export_refuses_snapshots_built_before_contract_1_1(
    tmp_path: Path, snapshots_synthetic: pd.DataFrame
):
    config_path = _config(tmp_path)
    (tmp_path / "interim").mkdir()
    old = snapshots_synthetic.drop(columns=["gg_p", "gg_q", "gg_v"])
    old.to_parquet(tmp_path / "interim" / "snapshots.parquet", index=False)
    (tmp_path / "reports").mkdir()
    (tmp_path / "reports" / "evaluation.json").write_text("{}", encoding="utf-8")
    result = CliRunner().invoke(app, ["export", "--config", str(config_path)])
    assert result.exit_code == 1
    assert "churnvalue build-snapshots" in result.output


def test_notebooks_site_converts_the_committed_notebooks_without_running_them(
    tmp_path: Path, monkeypatch
):
    monkeypatch.chdir(Path(__file__).parents[1])
    out = tmp_path / "site"

    result = CliRunner().invoke(app, ["notebooks-site", "--out", str(out)])

    assert result.exit_code == 0, result.output
    pages = sorted(path.name for path in out.glob("*.html"))
    assert len(pages) == 12
    assert pages[-1] == "index.html"
    index = (out / "index.html").read_text(encoding="utf-8")
    for page in pages[:-1]:
        assert f'href="{page}"' in index
        text = (out / page).read_text(encoding="utf-8")
        assert '<nav class="cv-bar"' in text
        assert "churn-value notebooks</title>" in text


def test_notebooks_site_reports_a_stale_notebook_and_exits_1(tmp_path: Path, monkeypatch):
    def refuse(*_args: object, **_kwargs: object) -> list[Path]:
        raise ValueError("not executed top to bottom, or edited after the run: 03_eda.ipynb")

    monkeypatch.setattr("churnvalue.cli.build_site", refuse)

    result = CliRunner().invoke(app, ["notebooks-site", "--out", str(tmp_path / "site")])

    assert result.exit_code == 1
    assert "03_eda.ipynb" in result.output


STAGES = [
    "download",
    "build_snapshots_cmd",
    "evaluate_baselines_cmd",
    "train",
    "evaluate",
    "export",
]


def _record_stages(monkeypatch, calls: list, failing: str | None = None):
    import typer

    def stage(name: str):
        def run(config, trials=None):
            calls.append((name, config, trials))
            if name == failing:
                typer.echo(f"{name} could not run", err=True)
                raise typer.Exit(code=1)

        return run

    for name in STAGES:
        monkeypatch.setattr(f"churnvalue.cli.{name}", stage(name))


def test_pipeline_runs_every_stage_in_order_and_passes_the_options(monkeypatch):
    calls: list = []
    _record_stages(monkeypatch, calls)

    result = CliRunner().invoke(app, ["pipeline", "--config", "x.yaml", "--trials", "3"])

    assert result.exit_code == 0, result.output
    assert [name for name, _, _ in calls] == STAGES
    assert all(config == Path("x.yaml") for _, config, _ in calls)
    assert [trials for name, _, trials in calls if name == "train"] == [3]
    assert "[1/6] download" in result.output
    assert "[6/6] export" in result.output


def test_pipeline_stops_at_the_first_stage_that_fails(monkeypatch):
    calls: list = []
    _record_stages(monkeypatch, calls, failing="build_snapshots_cmd")

    result = CliRunner().invoke(app, ["pipeline"])

    assert result.exit_code == 1
    assert [name for name, _, _ in calls] == ["download", "build_snapshots_cmd"]
    assert "build_snapshots_cmd could not run" in result.output
