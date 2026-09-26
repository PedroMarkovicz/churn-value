import numpy as np
import pytest

from churnvalue.btyd import (
    BGNBDParams,
    GammaGammaParams,
    bgnbd_p_alive,
    fit_bgnbd,
    fit_gamma_gamma,
    gamma_gamma_expected_aov,
)


def simulate_bgnbd(params: BGNBDParams, n: int, horizon: float, seed: int):
    """Generative BG/NBD: Poisson purchases at rate lambda, dropout with prob p after each."""
    rng = np.random.default_rng(seed)
    lam = rng.gamma(params.r, 1.0 / params.alpha, n)
    drop = rng.beta(params.a, params.b, n)
    x = np.zeros(n)
    t_x = np.zeros(n)
    big_t = rng.uniform(horizon / 2, horizon, n)  # customers join at different times
    for i in range(n):
        t = 0.0
        while True:
            t += rng.exponential(1.0 / lam[i])
            if t > big_t[i]:
                break
            x[i] += 1
            t_x[i] = t
            if rng.random() < drop[i]:
                break
    return x, t_x, big_t


def test_fit_bgnbd_recovers_parameters():
    true = BGNBDParams(r=0.8, alpha=4.0, a=0.6, b=2.5)
    x, t_x, big_t = simulate_bgnbd(true, n=4000, horizon=80.0, seed=1)
    fitted = fit_bgnbd(x, t_x, big_t)
    assert fitted.r == pytest.approx(true.r, rel=0.2)
    assert fitted.alpha == pytest.approx(true.alpha, rel=0.3)
    assert fitted.a / (fitted.a + fitted.b) == pytest.approx(true.a / (true.a + true.b), rel=0.25)


def test_p_alive_is_one_without_repeats_and_decays_with_inactivity():
    params = BGNBDParams(r=0.8, alpha=4.0, a=0.6, b=2.5)
    assert bgnbd_p_alive(params, [0.0], [0.0], [30.0])[0] == 1.0
    recent, stale = bgnbd_p_alive(params, [5.0, 5.0], [29.0, 5.0], [30.0, 30.0])
    assert 0.0 < stale < recent < 1.0


def test_fit_gamma_gamma_recovers_population_mean():
    true = GammaGammaParams(p=6.0, q=4.0, v=15.0)
    rng = np.random.default_rng(2)
    n = 5000
    nu = rng.gamma(true.q, 1.0 / true.v, n)
    x = rng.integers(2, 20, n).astype(float)
    m = np.array(
        [rng.gamma(true.p, 1.0 / nu_i, int(k)).mean() for nu_i, k in zip(nu, x, strict=True)]
    )
    fitted = fit_gamma_gamma(x, m)
    population_mean = lambda g: g.p * g.v / (g.q - 1.0)  # noqa: E731
    assert population_mean(fitted) == pytest.approx(population_mean(true), rel=0.1)
    assert fitted.q > 1.0


def test_gamma_gamma_expected_aov_shrinks_towards_population_mean():
    params = GammaGammaParams(p=6.0, q=4.0, v=15.0)
    population_mean = params.p * params.v / (params.q - 1.0)  # 30
    few, many = gamma_gamma_expected_aov(params, [2.0, 50.0], [100.0, 100.0])
    assert population_mean < few < many < 100.0


def test_gamma_gamma_fit_stays_finite_without_heterogeneity():
    # Every customer shares one spend distribution: the unpenalised MLE diverges (q, v -> inf).
    rng = np.random.default_rng(3)
    x = rng.integers(2, 10, 300).astype(float)
    m = np.array([rng.gamma(5.0, 20.0, int(k)).mean() for k in x])
    fitted = fit_gamma_gamma(x, m)
    expected = gamma_gamma_expected_aov(fitted, x, m)
    assert np.all(np.isfinite(expected))
    assert expected.mean() == pytest.approx(m.mean(), rel=0.1)
