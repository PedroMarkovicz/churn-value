"""Pipeline stages: download -> build-snapshots -> train -> evaluate -> export; notebooks."""

from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path
from typing import Any, NoReturn

import pandas as pd
import typer

from churnvalue.config import DEFAULT_CONFIG_PATH, Config, load_config, project_root
from churnvalue.contract import schema_documents
from churnvalue.data.clean import clean_transactions
from churnvalue.data.download import download_verified, xlsx_zip_to_parquet
from churnvalue.evaluate import (
    BASELINE_SCORERS,
    Scorer,
    evaluate_baselines,
    evaluate_models,
    supervised_scorer,
    temporal_split,
)
from churnvalue.golden import golden_documents
from churnvalue.model_card import render_model_card
from churnvalue.models import SUPERVISED
from churnvalue.notebooks import HTML_DIR, NOTEBOOKS_DIR, discover, execute_notebook, export_html
from churnvalue.provenance import run_tags
from churnvalue.snapshots import build_snapshots
from churnvalue.splits import rolling_origin_folds
from churnvalue.training import (
    TrainingResult,
    load_estimator,
    load_training,
    models_fingerprint,
    save_models,
    train_model,
)

app = typer.Typer(no_args_is_help=True, add_completion=False)
ConfigOption = typer.Option(DEFAULT_CONFIG_PATH, "--config", help="Path to the YAML config.")
OnlyOption = typer.Option(None, "--only", help="Run only these NN prefixes (repeatable).")
HtmlOption = typer.Option(True, "--html/--no-html", help="Export styled HTML.")
TrialsOption = typer.Option(None, "--trials", help="Override training.n_trials.")
EVALUATION_FILE = "evaluation.json"


def raw_zip_path(cfg: Config) -> Path:
    return cfg.data.raw_dir / "online_retail_ii.zip"


def raw_parquet_path(cfg: Config) -> Path:
    return cfg.data.interim_dir / "raw.parquet"


def transactions_path(cfg: Config) -> Path:
    return cfg.data.interim_dir / "transactions.parquet"


def snapshots_path(cfg: Config) -> Path:
    return cfg.data.interim_dir / "snapshots.parquet"


@app.command()
def download(config: Path = ConfigOption) -> None:
    """Download the UCI archive (checksum-verified) and convert it to Parquet."""
    cfg = load_config(config)
    zip_path = download_verified(cfg.data.url, raw_zip_path(cfg), cfg.data.sha256)
    out = xlsx_zip_to_parquet(zip_path, raw_parquet_path(cfg))
    typer.echo(f"raw data -> {out}")


@app.command("build-snapshots")
def build_snapshots_cmd(config: Path = ConfigOption) -> None:
    """Clean transactions and build labelled monthly snapshots."""
    cfg = load_config(config)
    tx = clean_transactions(pd.read_parquet(raw_parquet_path(cfg)))
    tx.to_parquet(transactions_path(cfg), index=False)
    snaps = build_snapshots(tx, cfg.snapshots)
    snaps.to_parquet(snapshots_path(cfg), index=False)
    summary = snaps.groupby("cutoff")["churn"].agg(["size", "mean"])
    typer.echo(summary.to_string())


@app.command("evaluate-baselines")
def evaluate_baselines_cmd(config: Path = ConfigOption) -> None:
    """Calibrate and evaluate the baseline scorers; write reports/baseline_evaluation.json."""
    cfg = load_config(config)
    report = evaluate_baselines(pd.read_parquet(snapshots_path(cfg)), cfg)
    cfg.reports_dir.mkdir(parents=True, exist_ok=True)
    out = write_json(cfg.reports_dir / "baseline_evaluation.json", report)
    typer.echo(f"report -> {out}")
    for row in report["policies"]:
        profit = f"£{row['realized_profit']:>12,.0f}"
        typer.echo(f"{row['policy']:>14}  k={row['n_contacted']:>5}  realized={profit}")


def fail(message: str) -> NoReturn:
    """Stop with a one-line hint on stderr instead of a traceback."""
    typer.echo(message, err=True)
    raise typer.Exit(code=1)


def require(path: Path, command: str) -> Path:
    """``path`` if it exists; otherwise stop and name the command that creates it."""
    if not path.is_file():
        fail(f"{path} not found: run `churnvalue {command}` first")
    return path


def write_json(path: Path, payload: Any) -> Path:
    """Strict JSON (no NaN): the web app parses these files."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, allow_nan=False), encoding="utf-8")
    return path


@app.command()
def train(config: Path = ConfigOption, trials: int | None = TrialsOption) -> None:
    """Tune (Optuna, rolling-origin CV) and fit the supervised models; track runs in MLflow."""
    from churnvalue.tracking import log_training  # MLflow is slow to import; only load it here

    cfg = load_config(config)
    snaps = pd.read_parquet(require(snapshots_path(cfg), "build-snapshots"))
    split = temporal_split(snaps, cfg)
    folds = rolling_origin_folds(
        split.train, cfg.snapshots.horizon_days, cfg.training.min_train_cutoffs
    )
    n_trials = trials or cfg.training.n_trials
    estimators: dict[str, Any] = {}
    results: dict[str, TrainingResult] = {}
    for name, spec in SUPERVISED.items():
        typer.echo(f"training {name} ({n_trials} trials, {len(folds)} folds) ...")
        estimator, result = train_model(
            spec, snaps, split.train, folds, n_trials, cfg.training.seed
        )
        run_id = log_training(cfg.tracking, result, run_tags(cfg))
        estimators[name] = estimator
        results[name] = replace(result, run_id=run_id)
        typer.echo(f"  cv log loss {result.cv_log_loss:.4f}  (run {run_id})")
    save_models(cfg.models_dir, estimators, results)
    typer.echo(f"models -> {cfg.models_dir}")


def model_scorers(cfg: Config) -> dict[str, Scorer]:
    """Every rung of the ladder, in ladder order: baselines, then the trained models."""
    supervised = {
        name: supervised_scorer(load_estimator(cfg.models_dir, name), spec)
        for name, spec in SUPERVISED.items()
    }
    return {**BASELINE_SCORERS, **supervised}


@app.command()
def evaluate(config: Path = ConfigOption) -> None:
    """Calibrate and evaluate every model; write reports/evaluation.json; log test metrics."""
    from churnvalue.tracking import log_test_metrics

    cfg = load_config(config)
    snaps = pd.read_parquet(require(snapshots_path(cfg), "build-snapshots"))
    try:
        training = load_training(cfg.models_dir)
        scorers = model_scorers(cfg)
        fingerprint = models_fingerprint(cfg.models_dir)
    except FileNotFoundError as missing:
        fail(str(missing))
    report = evaluate_models(snaps, scorers, cfg)
    report["models_sha256"] = fingerprint
    out = write_json(cfg.reports_dir / EVALUATION_FILE, report)
    policies = {row["policy"]: row for row in report["policies"]}
    for name in SUPERVISED:
        metrics = {k: v["value"] for k, v in report["models"][name]["metrics"].items()}
        metrics["realized_profit"] = policies[name]["realized_profit"]
        log_test_metrics(cfg.tracking, training[name]["run_id"], metrics)
    typer.echo(f"report -> {out}")
    for row in report["policies"]:
        profit = f"£{row['realized_profit']:>12,.0f}"
        typer.echo(f"{row['policy']:>18}  k={row['n_contacted']:>5}  realized={profit}")


@app.command()
def export(config: Path = ConfigOption) -> None:
    """Write the web artifacts (customers, timelines, evaluation, ONNX, ...) and a manifest."""
    from churnvalue.export import export_artifacts
    from churnvalue.tracking import export_experiments

    cfg = load_config(config)
    evaluation_path = require(cfg.reports_dir / EVALUATION_FILE, "evaluate")
    snapshots = pd.read_parquet(require(snapshots_path(cfg), "build-snapshots"))
    transactions = pd.read_parquet(require(transactions_path(cfg), "build-snapshots"))
    evaluation = json.loads(evaluation_path.read_text(encoding="utf-8"))
    try:
        scorers = model_scorers(cfg)
        estimator = load_estimator(cfg.models_dir, cfg.training.deployed_model)
        fingerprint = models_fingerprint(cfg.models_dir)
    except FileNotFoundError as missing:
        fail(str(missing))
    if evaluation.get("models_sha256") != fingerprint:
        fail(f"{evaluation_path} was made from other models: run `churnvalue evaluate` again")
    result = export_artifacts(
        cfg,
        snapshots=snapshots,
        transactions=transactions,
        scorers=scorers,
        estimator=estimator,
        evaluation=evaluation,
        experiments=export_experiments(cfg.tracking),
    )
    for name, digest in result.manifest.files.items():
        typer.echo(f"{name:>20}  {digest[:12]}")
    typer.echo(f"artifacts -> {cfg.artifacts_dir}")
    card = render_model_card(
        result.manifest, evaluation, load_training(cfg.models_dir), result.importance
    )
    cfg.model_card_path.parent.mkdir(parents=True, exist_ok=True)
    cfg.model_card_path.write_text(card, encoding="utf-8", newline="\n")
    typer.echo(f"model card -> {cfg.model_card_path}")


@app.command()
def contracts(config: Path = ConfigOption) -> None:
    """Regenerate the committed JSON Schemas and code-only golden vectors under contracts/."""
    cfg = load_config(config)
    documents = {
        **{f"schemas/{name}": text for name, text in schema_documents().items()},
        **{f"golden/{name}": text for name, text in golden_documents(cfg.snapshots).items()},
    }
    for relative, text in documents.items():
        path = cfg.contracts_dir / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8", newline="\n")
        typer.echo(f"contract -> {path}")


@app.command()
def notebooks(only: list[str] | None = OnlyOption, html: bool = HtmlOption) -> None:
    """Execute the analysis notebooks in place (fail on the first error) and export HTML."""
    root = project_root()
    paths = discover(root / NOTEBOOKS_DIR, only)
    if not paths:
        raise typer.BadParameter("no matching notebooks")
    for path in paths:
        typer.echo(f"running {path.name} ...")
        execute_notebook(path, working_dir=root)
        if html:
            typer.echo(f"  html -> {export_html(path, root / HTML_DIR)}")
