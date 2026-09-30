"""Golden vectors: Python's answers the TypeScript re-implementation must match (ADR 0009).

Economics and derived-feature vectors depend only on code, so they are committed under
``contracts/golden``. The model vectors depend on the trained model and ship with the artifacts.
"""

from __future__ import annotations

import itertools
from typing import Any

import numpy as np
import pandas as pd

from churnvalue.btyd import GammaGammaParams, gamma_gamma_expected_aov
from churnvalue.calibration import Calibrator
from churnvalue.config import SnapshotConfig
from churnvalue.contract import (
    BudgetCase,
    DerivedCase,
    DerivedGolden,
    EconomicsCase,
    EconomicsGolden,
    GammaGammaCase,
    GammaGammaGolden,
    GammaGammaSpec,
    ModelCase,
    ModelGolden,
)
from churnvalue.economics import (
    EconomicParams,
    break_even_probability,
    customer_economics,
    expected_cost,
    expected_profit,
    realized_profit,
    select_unconstrained,
    select_with_budget,
    value_at_risk,
)
from churnvalue.features import (
    BASE_FEATURES,
    DERIVED_FEATURES,
    SPEND_TREND_EPS,
    add_derived_features,
)
from churnvalue.models import ModelSpec, feature_matrix, predict_churn

TOLERANCE = 1e-9  # relative; float64 arithmetic in the same order should agree to ~1e-15
MODEL_TOLERANCE = 1e-5  # ONNX runs in float32
SEED = 20260926

DEFAULT_PARAMS = EconomicParams(
    margin=0.35, lambda_c=0.10, lambda_a=10.0, gamma=0.30, contact_cost=1.0, value_horizon_days=365
)
# Each variant exercises a branch: B = CAC < V, gamma = 0, free contacts, extreme margins.
PARAM_VARIANTS = [
    DEFAULT_PARAMS,
    DEFAULT_PARAMS.model_copy(update={"lambda_a": 5.0}),
    DEFAULT_PARAMS.model_copy(update={"lambda_c": 0.25, "lambda_a": 2.0}),
    DEFAULT_PARAMS.model_copy(update={"gamma": 0.0}),
    DEFAULT_PARAMS.model_copy(update={"gamma": 1.0, "contact_cost": 0.0}),
    DEFAULT_PARAMS.model_copy(update={"margin": 1.0, "value_horizon_days": 90}),
]
CUSTOMERS = [  # (aov_gg, cadence_days): tiny, typical, floor-cadence and very large customers
    (5.0, 120.0),
    (250.0, 30.0),
    (80.0, 7.0),
    (4_000.0, 60.0),
]
PROBABILITIES = [0.0, 0.05, 0.5, 0.97, 1.0]


def economics_golden() -> EconomicsGolden:
    cases = []
    for params, (aov, cadence), p, churn in itertools.product(
        PARAM_VARIANTS, CUSTOMERS, PROBABILITIES, (0, 1)
    ):
        econ = customer_economics(value_at_risk([aov], [cadence], params), params)
        exp_profit = expected_profit([p], econ, params)
        cases.append(
            EconomicsCase(
                params=params,
                aov_gg=aov,
                cadence_days=cadence,
                p=p,
                churn=churn,
                value=float(econ.value[0]),
                crc=float(econ.crc[0]),
                cac=float(econ.cac[0]),
                benefit=float(econ.benefit[0]),
                expected_profit=float(exp_profit[0]),
                break_even_p=float(break_even_probability(econ, params)[0]),
                contact=bool(select_unconstrained(exp_profit)[0]),
                expected_cost=float(expected_cost([p], econ, params)[0]),
                realized_profit=float(realized_profit([churn], econ, params)[0]),
            )
        )
    return EconomicsGolden(tolerance=TOLERANCE, cases=cases, budget_cases=_budget_cases())


def _budget_cases() -> list[BudgetCase]:
    rng = np.random.default_rng(SEED)
    profits = np.round(rng.normal(5.0, 20.0, 40), 4)
    costs = np.round(rng.uniform(1.0, 30.0, 40), 4)
    tied = np.array([10.0, 10.0, 10.0, -1.0, 0.0])  # stable order on ties; 0 is never contacted
    tied_cost = np.array([5.0, 5.0, 5.0, 5.0, 5.0])
    settings: list[tuple[Any, Any, float | None, int | None]] = [
        (profits, costs, None, None),
        (profits, costs, 150.0, None),
        (profits, costs, None, 5),
        (profits, costs, 150.0, 5),
        (profits, costs, 0.0, None),
        (tied, tied_cost, 10.0, None),
        (tied, tied_cost, None, 2),
    ]
    return [
        BudgetCase(
            expected_profit=[float(v) for v in profit],
            expected_cost=[float(v) for v in cost],
            budget=budget,
            max_contacts=max_contacts,
            selected=[bool(v) for v in select_with_budget(profit, cost, budget, max_contacts)],
        )
        for profit, cost, budget, max_contacts in settings
    ]


def derived_golden(horizon_days: int, cadence_floor_days: float) -> DerivedGolden:
    """Base rows -> derived features, including one-purchase-day and floor-cadence customers."""
    rng = np.random.default_rng(SEED)
    n = 60
    tenure = rng.integers(0, 700, n)
    recency = np.minimum(rng.integers(0, 400, n), tenure)
    base = pd.DataFrame(
        {
            "recency_days": recency,
            "n_purchase_days": rng.integers(1, 80, n),
            "tenure_days": tenure,
            "total_spend": np.round(rng.lognormal(7, 1.2, n), 2),
            "avg_order_value": np.round(rng.lognormal(5, 0.8, n), 2),
            "n_distinct_products": rng.integers(1, 500, n),
            "return_rate": np.round(rng.uniform(0, 0.3, n), 4),
            "spend_90d": np.round(rng.lognormal(5, 1.5, n) * rng.integers(0, 2, n), 2),
            "spend_prev_90d": np.round(rng.lognormal(5, 1.5, n) * rng.integers(0, 2, n), 2),
            "purchases_90d": rng.integers(0, 10, n),
            "cadence_cv": np.round(rng.uniform(0, 2, n), 4),
            "bought_same_window_last_year": rng.integers(0, 2, n),
            "is_uk": rng.integers(0, 2, n),
        }
    )
    edge = pd.DataFrame(  # one purchase day; same-day span (cadence floor); zero previous spend
        [
            {**base.iloc[0].to_dict(), "n_purchase_days": 1, "tenure_days": 40, "recency_days": 40},
            {**base.iloc[1].to_dict(), "n_purchase_days": 5, "tenure_days": 3, "recency_days": 1},
            {**base.iloc[2].to_dict(), "spend_prev_90d": 0.0, "spend_90d": 0.0},
        ]
    )
    base = pd.concat([base, edge], ignore_index=True)[BASE_FEATURES]
    derived = add_derived_features(base, horizon_days, cadence_floor_days)
    cases = [
        DerivedCase(
            base={name: float(row[name]) for name in BASE_FEATURES},
            derived={name: float(row[name]) for name in DERIVED_FEATURES},
        )
        for _, row in derived.iterrows()
    ]
    return DerivedGolden(
        tolerance=TOLERANCE,
        horizon_days=horizon_days,
        cadence_floor_days=cadence_floor_days,
        spend_trend_eps=SPEND_TREND_EPS,
        cases=cases,
    )


# (p, q, v): a fit like the real data's, a heavy-shrinkage one, and one with q close to 1
GAMMA_GAMMA_PARAMS = [(3.2, 4.1, 180.0), (0.8, 2.5, 40.0), (12.0, 1.05, 2_500.0)]
GAMMA_GAMMA_CUSTOMERS = [(1.0, 25.0), (2.0, 300.9), (6.0, 499.9), (40.0, 88.8), (150.0, 12_345.6)]


def gamma_gamma_golden() -> GammaGammaGolden:
    """(params, purchase days, average order value) -> shrunk AOV, for the what-if's value."""
    cases = []
    for (p, q, v), (n, m) in itertools.product(GAMMA_GAMMA_PARAMS, GAMMA_GAMMA_CUSTOMERS):
        aov = gamma_gamma_expected_aov(GammaGammaParams(p, q, v), [n], [m])
        cases.append(
            GammaGammaCase(
                params=GammaGammaSpec(p=p, q=q, v=v),
                n_purchase_days=n,
                avg_order_value=m,
                aov_gg=float(aov[0]),
            )
        )
    return GammaGammaGolden(tolerance=TOLERANCE, cases=cases)


def model_golden(
    estimator: Any, spec: ModelSpec, calibrator: Calibrator, frame: pd.DataFrame, n: int = 50
) -> ModelGolden:
    """Native model scores for real test rows: the browser's ONNX + calibrator must match."""
    rows = frame.head(n)
    scores = predict_churn(estimator, rows, spec)
    probabilities = calibrator.transform(scores)
    x = feature_matrix(rows, spec)
    return ModelGolden(
        model=spec.name,
        tolerance=MODEL_TOLERANCE,
        order=list(spec.features),
        cases=[
            ModelCase(
                features=[float(v) for v in x[i]], score=float(scores[i]), p=float(probabilities[i])
            )
            for i in range(len(rows))
        ],
    )


def golden_documents(snapshots: SnapshotConfig) -> dict[str, str]:
    """The committed, code-only vectors: file name -> JSON text (LF, final newline)."""
    goldens = {
        "economics.json": economics_golden(),
        "derived_features.json": derived_golden(
            snapshots.horizon_days, snapshots.cadence_floor_days
        ),
        "gamma_gamma.json": gamma_gamma_golden(),
    }
    return {name: golden.model_dump_json(indent=2) + "\n" for name, golden in goldens.items()}
