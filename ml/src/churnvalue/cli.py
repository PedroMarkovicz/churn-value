"""Pipeline stages: download -> build-snapshots -> evaluate-baselines."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import typer

from churnvalue.config import DEFAULT_CONFIG_PATH, Config, load_config
from churnvalue.data.clean import clean_transactions
from churnvalue.data.download import download_verified, xlsx_zip_to_parquet
from churnvalue.evaluate import evaluate_baselines
from churnvalue.snapshots import build_snapshots

app = typer.Typer(no_args_is_help=True, add_completion=False)
ConfigOption = typer.Option(DEFAULT_CONFIG_PATH, "--config", help="Path to the YAML config.")


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
    out = cfg.reports_dir / "baseline_evaluation.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    typer.echo(f"report -> {out}")
    for row in report["policies"]:
        profit = f"£{row['realized_profit']:>12,.0f}"
        typer.echo(f"{row['policy']:>14}  k={row['n_contacted']:>5}  realized={profit}")
