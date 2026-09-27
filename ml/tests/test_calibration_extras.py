import numpy as np
import pytest

from churnvalue.calibration import (
    IsotonicCalibrator,
    PlattCalibrator,
    calibrator_from_dict,
    saerens_prior_shift,
)


@pytest.mark.parametrize(
    "calibrator",
    [
        IsotonicCalibrator(x_thresholds=(0.1, 0.5, 0.9), y_thresholds=(0.05, 0.4, 0.8)),
        PlattCalibrator(slope=2.5, intercept=-1.0),
    ],
)
def test_calibrator_dict_roundtrip(calibrator):
    restored = calibrator_from_dict(calibrator.to_dict())
    assert restored == calibrator
    scores = np.linspace(0, 1, 11)
    assert np.array_equal(restored.transform(scores), calibrator.transform(scores))


def test_unknown_calibration_method_is_rejected():
    with pytest.raises(ValueError, match="unknown calibration method"):
        calibrator_from_dict({"method": "beta"})


def _posteriors(prior: float, n: int, seed: int) -> tuple[np.ndarray, np.ndarray]:
    """Labels at ``prior`` and the Bayes posterior under a 0.5 training prior (x | y fixed)."""
    rng = np.random.default_rng(seed)
    y = (rng.random(n) < prior).astype(float)
    x = rng.normal(np.where(y == 1, 1.0, -1.0), 1.0)
    likelihood_ratio = np.exp(2.0 * x)  # N(1, 1) / N(-1, 1)
    return y, likelihood_ratio / (1.0 + likelihood_ratio)


def test_saerens_keeps_the_prior_when_nothing_shifted():
    _, p = _posteriors(0.5, 20_000, seed=0)
    _, prior = saerens_prior_shift(p, source_prior=0.5)
    assert prior == pytest.approx(0.5, abs=0.02)


def test_saerens_recovers_a_pure_prior_shift():
    y, p = _posteriors(0.2, 20_000, seed=1)
    adjusted, prior = saerens_prior_shift(p, source_prior=0.5)
    assert prior == pytest.approx(0.2, abs=0.02)
    assert adjusted.mean() == pytest.approx(y.mean(), abs=0.02)
    # A monotone re-weighting: the ranking is unchanged.
    assert np.array_equal(np.argsort(adjusted, kind="stable"), np.argsort(p, kind="stable"))
