import json
from pathlib import Path

import numpy as np
import pandas as pd

from churnvalue.reporting import StageSummary, to_jsonable


def test_to_jsonable_converts_numpy_pandas_and_non_finite():
    payload = to_jsonable(
        {
            "n": np.int64(3),
            "rate": np.float64(0.25),
            "missing": float("nan"),
            "inf": np.inf,
            "flag": np.bool_(True),
            "when": pd.Timestamp("2011-09-10"),
            "arr": np.array([1, 2]),
            "series": pd.Series({"a": np.float64(1.5)}),
        }
    )
    assert payload == {
        "n": 3,
        "rate": 0.25,
        "missing": None,
        "inf": None,
        "flag": True,
        "when": "2011-09-10T00:00:00",
        "arr": [1, 2],
        "series": {"a": 1.5},
    }


def test_stage_summary_writes_strict_json(tmp_path: Path):
    s = StageSummary("03")
    s["churn_rate"] = np.float64(0.308)
    s["undefined"] = float("nan")
    path = s.write(tmp_path / "results")
    assert path.name == "03_summary.json"
    text = path.read_text(encoding="utf-8")
    assert "NaN" not in text
    assert json.loads(text) == {"stage": "03", "churn_rate": 0.308, "undefined": None}
