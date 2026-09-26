"""Score -> probability calibration, selected by cross-validated Brier score."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

import numpy as np
from numpy.typing import ArrayLike, NDArray
from scipy.special import expit
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold

FloatArray = NDArray[np.float64]
Method = Literal["isotonic", "platt"]


class Calibrator(Protocol):
    @property
    def method(self) -> Method: ...

    def transform(self, scores: ArrayLike) -> FloatArray: ...

    def to_dict(self) -> dict[str, object]: ...


@dataclass(frozen=True)
class IsotonicCalibrator:
    x_thresholds: tuple[float, ...]
    y_thresholds: tuple[float, ...]
    method: Method = "isotonic"

    def transform(self, scores: ArrayLike) -> FloatArray:
        # np.interp clips outside the fitted range, matching out_of_bounds="clip".
        return np.interp(np.asarray(scores, dtype=np.float64), self.x_thresholds, self.y_thresholds)

    def to_dict(self) -> dict[str, object]:
        return {"method": self.method, "x": list(self.x_thresholds), "y": list(self.y_thresholds)}


@dataclass(frozen=True)
class PlattCalibrator:
    slope: float
    intercept: float
    method: Method = "platt"

    def transform(self, scores: ArrayLike) -> FloatArray:
        return expit(self.slope * np.asarray(scores, dtype=np.float64) + self.intercept)

    def to_dict(self) -> dict[str, object]:
        return {"method": self.method, "slope": self.slope, "intercept": self.intercept}


def fit_calibrator(scores: ArrayLike, y: ArrayLike, method: Method) -> Calibrator:
    s = np.asarray(scores, dtype=np.float64)
    y_arr = np.asarray(y, dtype=np.float64)
    if method == "isotonic":
        iso = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip").fit(s, y_arr)
        return IsotonicCalibrator(
            x_thresholds=tuple(float(v) for v in iso.X_thresholds_),
            y_thresholds=tuple(float(v) for v in iso.y_thresholds_),
        )
    logit = LogisticRegression(C=1e6).fit(s.reshape(-1, 1), y_arr)
    return PlattCalibrator(slope=float(logit.coef_[0, 0]), intercept=float(logit.intercept_[0]))


def select_calibrator(scores: ArrayLike, y: ArrayLike, seed: int, n_splits: int = 5) -> Calibrator:
    s = np.asarray(scores, dtype=np.float64)
    y_arr = np.asarray(y, dtype=np.float64)
    if np.unique(y_arr).size < 2:
        raise ValueError("calibration set must contain both churners and non-churners")
    folds = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=seed)
    cv_brier: dict[Method, float] = {}
    for method in ("isotonic", "platt"):
        errors = []
        for fit_idx, val_idx in folds.split(s, y_arr):
            cal = fit_calibrator(s[fit_idx], y_arr[fit_idx], method)
            errors.append(np.mean((cal.transform(s[val_idx]) - y_arr[val_idx]) ** 2))
        cv_brier[method] = float(np.mean(errors))
    best: Method = min(cv_brier, key=lambda m: cv_brier[m])
    return fit_calibrator(s, y_arr, best)
