"""Per-stage summaries: every number a notebook quotes, written as strict JSON."""

from __future__ import annotations

import json
import math
from collections.abc import Mapping
from datetime import date, datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


def to_jsonable(value: Any) -> Any:
    """Convert numpy/pandas scalars, arrays and timestamps to plain JSON; NaN/inf -> None."""
    if isinstance(value, Mapping):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    if isinstance(value, list | tuple | set):
        return [to_jsonable(v) for v in value]
    if isinstance(value, np.ndarray):
        return [to_jsonable(v) for v in value.tolist()]
    if isinstance(value, pd.Series):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    if isinstance(value, pd.Timestamp | datetime | date):
        return value.isoformat()
    if isinstance(value, np.bool_ | bool):
        return bool(value)
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating | float):
        f = float(value)
        return f if math.isfinite(f) else None
    return value


class StageSummary:
    """Collects the statistics quoted in a notebook and writes ``<stage>_summary.json``."""

    def __init__(self, stage: str) -> None:
        self.stage = stage
        self.values: dict[str, Any] = {}

    def __setitem__(self, key: str, value: Any) -> None:
        self.values[key] = to_jsonable(value)

    def __getitem__(self, key: str) -> Any:
        return self.values[key]

    def write(self, results_dir: str | Path) -> Path:
        results_dir = Path(results_dir)
        results_dir.mkdir(parents=True, exist_ok=True)
        path = results_dir / f"{self.stage}_summary.json"
        payload = {"stage": self.stage, **self.values}
        path.write_text(json.dumps(payload, indent=2, allow_nan=False), encoding="utf-8")
        return path
