"""Typed pipeline configuration loaded from YAML."""

from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field

from churnvalue.economics import EconomicParams


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class DataConfig(_Frozen):
    url: str
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    raw_dir: Path
    interim_dir: Path


class SnapshotConfig(_Frozen):
    horizon_days: int = Field(gt=0)
    eligibility_f: float = Field(ge=0)
    min_history_months: int = Field(ge=1)
    cadence_floor_days: float = Field(gt=0)


class SplitConfig(_Frozen):
    calibration_offset_months: int = Field(ge=1)


class EvaluationConfig(_Frozen):
    n_bootstrap: int = Field(ge=100)
    seed: int
    emp_gamma_alpha: float = Field(gt=0)
    emp_gamma_beta: float = Field(gt=0)


class Config(_Frozen):
    data: DataConfig
    snapshots: SnapshotConfig
    splits: SplitConfig
    economics: EconomicParams
    evaluation: EvaluationConfig
    reports_dir: Path


DEFAULT_CONFIG_PATH = Path("configs/default.yaml")


def project_root(start: Path | None = None) -> Path:
    """Nearest directory (from ``start`` upwards) holding ``configs/default.yaml``.

    Config paths are relative to it; notebooks call this so they run from any directory.
    """
    here = (start or Path.cwd()).resolve()
    for candidate in (here, *here.parents):
        if (candidate / DEFAULT_CONFIG_PATH).is_file():
            return candidate
    raise FileNotFoundError(f"no {DEFAULT_CONFIG_PATH} found in {here} or its parents")


def load_config(path: Path = DEFAULT_CONFIG_PATH) -> Config:
    with path.open(encoding="utf-8") as fh:
        return Config.model_validate(yaml.safe_load(fh))
