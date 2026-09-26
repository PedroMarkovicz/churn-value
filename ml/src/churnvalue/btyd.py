"""BG/NBD and Gamma-Gamma models fitted by maximum likelihood.

References: Fader, Hardie & Lee (2005), "Counting your customers the easy way";
Fader & Hardie (2013), "The Gamma-Gamma model of monetary value".
Time unit: weeks. x = repeat purchase days, t_x = time of last purchase since the first,
T = customer age at the cutoff.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike, NDArray
from scipy.optimize import minimize
from scipy.special import betaln, gammaln

FloatArray = NDArray[np.float64]
DAYS_PER_WEEK = 7.0
# L2 penalty on log-parameters (as lifetimes' penalizer_coef): keeps the MLE finite when the
# data carry no between-customer heterogeneity, where the likelihood is maximised at infinity.
DEFAULT_PENALIZER = 1e-3


@dataclass(frozen=True)
class BGNBDParams:
    r: float
    alpha: float
    a: float
    b: float


@dataclass(frozen=True)
class GammaGammaParams:
    p: float
    q: float
    v: float


def bgnbd_log_likelihood(
    params: BGNBDParams, x: ArrayLike, t_x: ArrayLike, big_t: ArrayLike
) -> FloatArray:
    x_arr = np.asarray(x, dtype=np.float64)
    tx_arr = np.asarray(t_x, dtype=np.float64)
    t_arr = np.asarray(big_t, dtype=np.float64)
    r, alpha, a, b = params.r, params.alpha, params.a, params.b
    common = gammaln(r + x_arr) - gammaln(r) + r * np.log(alpha)
    alive_term = betaln(a, b + x_arr) - betaln(a, b) - (r + x_arr) * np.log(alpha + t_arr)
    repeat = x_arr > 0
    # For x = 0 the dropout term is absent; b + x - 1 would be invalid there, so guard it.
    dropout_term = np.where(
        repeat,
        betaln(a + 1.0, np.where(repeat, b + x_arr - 1.0, 1.0))
        - betaln(a, b)
        - (r + x_arr) * np.log(alpha + tx_arr),
        -np.inf,
    )
    return common + np.logaddexp(alive_term, dropout_term)


def fit_bgnbd(
    x: ArrayLike, t_x: ArrayLike, big_t: ArrayLike, penalizer: float = DEFAULT_PENALIZER
) -> BGNBDParams:
    def objective(log_params: FloatArray) -> float:
        params = BGNBDParams(*np.exp(log_params))
        nll = -float(np.sum(bgnbd_log_likelihood(params, x, t_x, big_t)))
        return nll + penalizer * float(np.sum(log_params**2))

    result = minimize(
        objective,
        x0=np.zeros(4),
        method="Nelder-Mead",
        options={"maxiter": 20_000, "xatol": 1e-6, "fatol": 1e-6},
    )
    if not result.success:
        raise RuntimeError(f"BG/NBD fit did not converge: {result.message}")
    return BGNBDParams(*np.exp(result.x))


def bgnbd_p_alive(
    params: BGNBDParams, x: ArrayLike, t_x: ArrayLike, big_t: ArrayLike
) -> FloatArray:
    x_arr = np.asarray(x, dtype=np.float64)
    tx_arr = np.asarray(t_x, dtype=np.float64)
    t_arr = np.asarray(big_t, dtype=np.float64)
    repeat = x_arr > 0
    log_odds_dead = (
        np.log(params.a)
        - np.log(np.where(repeat, params.b + x_arr - 1.0, 1.0))
        + (params.r + x_arr) * (np.log(params.alpha + t_arr) - np.log(params.alpha + tx_arr))
    )
    return np.where(repeat, 1.0 / (1.0 + np.exp(log_odds_dead)), 1.0)


def gamma_gamma_log_likelihood(params: GammaGammaParams, x: ArrayLike, m: ArrayLike) -> FloatArray:
    x_arr = np.asarray(x, dtype=np.float64)
    m_arr = np.asarray(m, dtype=np.float64)
    p, q, v = params.p, params.q, params.v
    px = p * x_arr
    return (
        gammaln(px + q)
        - gammaln(px)
        - gammaln(q)
        + q * np.log(v)
        + (px - 1.0) * np.log(m_arr)
        + px * np.log(x_arr)
        - (px + q) * np.log(x_arr * m_arr + v)
    )


def _gg_from_unconstrained(theta: FloatArray) -> GammaGammaParams:
    # q > 1 is required for a finite conditional expectation.
    return GammaGammaParams(
        p=float(np.exp(theta[0])), q=1.0 + float(np.exp(theta[1])), v=float(np.exp(theta[2]))
    )


def fit_gamma_gamma(
    x: ArrayLike, m: ArrayLike, penalizer: float = DEFAULT_PENALIZER
) -> GammaGammaParams:
    m_arr = np.asarray(m, dtype=np.float64)
    x0 = np.array([0.0, 0.0, np.log(np.median(m_arr))])

    def objective(theta: FloatArray) -> float:
        params = _gg_from_unconstrained(theta)
        nll = -float(np.sum(gamma_gamma_log_likelihood(params, x, m_arr)))
        return nll + penalizer * float(np.sum(theta**2))

    result = minimize(
        objective,
        x0=x0,
        method="Nelder-Mead",
        options={"maxiter": 20_000, "xatol": 1e-6, "fatol": 1e-6},
    )
    if not result.success:
        raise RuntimeError(f"Gamma-Gamma fit did not converge: {result.message}")
    return _gg_from_unconstrained(result.x)


def gamma_gamma_expected_aov(params: GammaGammaParams, x: ArrayLike, m: ArrayLike) -> FloatArray:
    """Posterior mean spend per purchase: p*(v + x*m) / (p*x + q - 1)."""
    x_arr = np.asarray(x, dtype=np.float64)
    m_arr = np.asarray(m, dtype=np.float64)
    return params.p * (params.v + x_arr * m_arr) / (params.p * x_arr + params.q - 1.0)
