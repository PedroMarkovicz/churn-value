"""Retention economics: EMP-style expected profit extended with acquisition cost (ADR 0003/0004)."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike, NDArray
from pydantic import BaseModel, ConfigDict, Field

FloatArray = NDArray[np.float64]


class EconomicParams(BaseModel):
    """User-configurable business assumptions. Defaults live in configs/default.yaml."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    margin: float = Field(gt=0, le=1)
    lambda_c: float = Field(ge=0, le=1)
    lambda_a: float = Field(ge=1)
    gamma: float = Field(ge=0, le=1)
    contact_cost: float = Field(ge=0)
    value_horizon_days: float = Field(gt=0)


@dataclass(frozen=True)
class CustomerEconomics:
    value: FloatArray  # V: margin at risk over the value horizon, conditional on staying
    crc: FloatArray  # retention incentive = lambda_c * V
    cac: FloatArray  # replacement cost = lambda_a * CRC
    benefit: FloatArray  # B = min(V, CAC): cheapest way to cover the loss of a churner

    def subset(self, idx: NDArray[np.intp]) -> CustomerEconomics:
        """Rows `idx` of every array, kept aligned (used by the bootstrap)."""
        return CustomerEconomics(
            value=self.value[idx], crc=self.crc[idx], cac=self.cac[idx], benefit=self.benefit[idx]
        )


def value_at_risk(aov: ArrayLike, cadence_days: ArrayLike, params: EconomicParams) -> FloatArray:
    aov_arr = np.asarray(aov, dtype=np.float64)
    cadence_arr = np.asarray(cadence_days, dtype=np.float64)
    return params.margin * aov_arr * (params.value_horizon_days / cadence_arr)


def customer_economics(value: ArrayLike, params: EconomicParams) -> CustomerEconomics:
    v = np.asarray(value, dtype=np.float64)
    crc = params.lambda_c * v
    cac = params.lambda_a * crc
    return CustomerEconomics(value=v, crc=crc, cac=cac, benefit=np.minimum(v, cac))


def expected_profit(p: ArrayLike, econ: CustomerEconomics, params: EconomicParams) -> FloatArray:
    """E[profit | contact] = p*gamma*(B - CRC) - (1 - p)*CRC - c."""
    p_arr = np.asarray(p, dtype=np.float64)
    return (
        p_arr * params.gamma * (econ.benefit - econ.crc)
        - (1.0 - p_arr) * econ.crc
        - params.contact_cost
    )


def expected_cost(p: ArrayLike, econ: CustomerEconomics, params: EconomicParams) -> FloatArray:
    """Expected spend of one contact: incentive paid by accepting churners and all non-churners."""
    p_arr = np.asarray(p, dtype=np.float64)
    return params.contact_cost + econ.crc * (p_arr * params.gamma + 1.0 - p_arr)


def realized_profit(y: ArrayLike, econ: CustomerEconomics, params: EconomicParams) -> FloatArray:
    """Profit of contacting each customer given the true label, acceptance taken in expectation."""
    y_arr = np.asarray(y, dtype=np.float64)
    return (
        y_arr * params.gamma * (econ.benefit - econ.crc)
        - (1.0 - y_arr) * econ.crc
        - params.contact_cost
    )


def select_unconstrained(exp_profit: ArrayLike) -> NDArray[np.bool_]:
    """Bayes-optimal rule with calibrated p: contact iff expected profit is positive."""
    return np.asarray(exp_profit, dtype=np.float64) > 0.0


def select_with_budget(
    exp_profit: ArrayLike,
    exp_cost: ArrayLike,
    budget: float | None = None,
    max_contacts: int | None = None,
) -> NDArray[np.bool_]:
    """Greedy top-k by expected profit among positive-profit customers, within budget/capacity."""
    profit = np.asarray(exp_profit, dtype=np.float64)
    cost = np.asarray(exp_cost, dtype=np.float64)
    order = np.argsort(-profit, kind="stable")
    take = profit[order] > 0.0
    if max_contacts is not None:
        take &= np.arange(order.size) < max_contacts
    if budget is not None:
        take &= np.cumsum(np.where(take, cost[order], 0.0)) <= budget
    mask = np.zeros(order.size, dtype=bool)
    mask[order[take]] = True
    return mask
