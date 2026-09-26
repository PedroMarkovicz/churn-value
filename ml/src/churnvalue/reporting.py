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


def _key(key: Any) -> str:
    """Mapping keys as strings; temporal keys in the same ISO format as temporal values."""
    converted = to_jsonable(key)
    return converted if isinstance(converted, str) else str(converted)


def to_jsonable(value: Any) -> Any:
    """Convert numpy/pandas scalars, arrays and temporal values to plain JSON.

    Missing values (NaN, inf, NaT, pd.NA) become None; timestamps and datetime64 become ISO
    strings; timedeltas become ISO-8601 durations; periods become their string form.
    """
    if isinstance(value, Mapping):
        return {_key(k): to_jsonable(v) for k, v in value.items()}
    if isinstance(value, pd.Series):
        return {_key(k): to_jsonable(v) for k, v in value.items()}
    if isinstance(value, list | tuple | set):
        return [to_jsonable(v) for v in value]
    if isinstance(value, np.ndarray):
        return [to_jsonable(v) for v in value.tolist()]
    if value is None or (pd.api.types.is_scalar(value) and pd.isna(value)):
        return None
    if isinstance(value, np.datetime64):
        return to_jsonable(pd.Timestamp(value))
    if isinstance(value, pd.Timestamp | datetime | date):
        return value.isoformat()
    if isinstance(value, pd.Timedelta | np.timedelta64):
        return pd.Timedelta(value).isoformat()
    if isinstance(value, pd.Period):
        return str(value)
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
        converted = to_jsonable(value)
        json.dumps(converted, allow_nan=False)  # fail here, where the bad value is assigned
        self.values[key] = converted

    def __getitem__(self, key: str) -> Any:
        return self.values[key]

    def write(self, results_dir: str | Path) -> Path:
        results_dir = Path(results_dir)
        results_dir.mkdir(parents=True, exist_ok=True)
        path = results_dir / f"{self.stage}_summary.json"
        payload = {"stage": self.stage, **self.values}
        path.write_text(json.dumps(payload, indent=2, allow_nan=False), encoding="utf-8")
        return path
