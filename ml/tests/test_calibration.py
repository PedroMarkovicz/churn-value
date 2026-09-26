import numpy as np
import pytest

from churnvalue.calibration import (
    IsotonicCalibrator,
    PlattCalibrator,
    fit_calibrator,
    select_calibrator,
)


def logistic_data(n: int = 2000, seed: int = 0):
    rng = np.random.default_rng(seed)
    score = rng.normal(0, 2, n)
    y = (rng.random(n) < 1 / (1 + np.exp(-(1.5 * score - 0.5)))).astype(float)
    return score, y


def test_platt_recovers_logistic_link():
    score, y = logistic_data()
    cal = fit_calibrator(score, y, "platt")
    assert isinstance(cal, PlattCalibrator)
    assert cal.slope == pytest.approx(1.5, rel=0.15)
    assert cal.intercept == pytest.approx(-0.5, abs=0.2)


def test_isotonic_is_monotone_bounded_and_clips_out_of_range():
    score, y = logistic_data()
    cal = fit_calibrator(score, y, "isotonic")
    assert isinstance(cal, IsotonicCalibrator)
    grid = np.linspace(-20, 20, 200)
    p = cal.transform(grid)
    assert np.all(np.diff(p) >= 0)
    assert p.min() >= 0.0 and p.max() <= 1.0
    assert cal.transform([-1e9])[0] == p[0]


def test_select_calibrator_returns_serializable_calibrator():
    score, y = logistic_data()
    cal = select_calibrator(score, y, seed=0)
    assert cal.method in {"isotonic", "platt"}
    payload = cal.to_dict()
    assert payload["method"] == cal.method


def test_select_calibrator_rejects_single_class():
    with pytest.raises(ValueError, match="both churners and non-churners"):
        select_calibrator(np.linspace(0, 1, 50), np.zeros(50), seed=0)
