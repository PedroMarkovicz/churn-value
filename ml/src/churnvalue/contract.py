"""The typed contract between the Python pipeline and the web app (design §6.2).

Every artifact the site reads is an instance of one of these models. JSON Schemas are generated
from them into ``contracts/schemas``; the web build generates its TypeScript types from those
schemas, so a contract change on the Python side breaks the web build (by design).
"""

from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from churnvalue.economics import EconomicParams

CONTRACT_VERSION = "1.1.0"
Probability = Annotated[float, Field(ge=0.0, le=1.0)]


class _Strict(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


# --- calibrator.json ----------------------------------------------------------------------


class IsotonicSpec(_Strict):
    method: Literal["isotonic"]
    x: list[float] = Field(min_length=1)
    y: list[Probability] = Field(min_length=1)


class PlattSpec(_Strict):
    method: Literal["platt"]
    slope: float
    intercept: float


CalibratorSpec = Annotated[IsotonicSpec | PlattSpec, Field(discriminator="method")]


class CalibratorFile(_Strict):
    model: str
    calibrator: CalibratorSpec


# --- feature_spec.json --------------------------------------------------------------------


class FeatureEntry(_Strict):
    name: str
    group: Literal["base", "derived", "context"]
    unit: str
    description: str
    editable: bool
    dtype: Literal["int", "float"]
    min: float
    max: float


class GammaGammaSpec(_Strict):
    """Gamma-Gamma parameters of the served cutoff: AOV^GG = p(v + x m) / (p x + q - 1)."""

    p: float = Field(gt=0)
    q: float = Field(gt=1)
    v: float = Field(gt=0)


class FeatureSpec(_Strict):
    order: list[str]  # model input order (the ONNX input columns)
    features: list[FeatureEntry]
    horizon_days: int
    cadence_floor_days: float
    spend_trend_eps: float
    context: dict[str, float]  # fixed context values at the test cutoff
    onnx_input: str
    onnx_output: str
    gamma_gamma: GammaGammaSpec  # lets the what-if recompute AOV^GG when spend is edited


# --- customers.json -----------------------------------------------------------------------


class Contribution(_Strict):
    feature: str
    value: float
    shap: float


class Customer(_Strict):
    customer_id: int
    churn: Literal[0, 1]
    p: dict[str, Probability]  # calibrated churn probability per model
    features: dict[str, float]  # every model input, by name
    aov_gg: float = Field(gt=0)
    cadence_days: float = Field(gt=0)
    shap_baseline: float  # log-odds before customer features (expected value + month terms)
    top_contributions: list[Contribution]


class CustomersFile(_Strict):
    cutoff: date
    horizon_days: int
    models: list[str]  # ladder order
    deployed_model: str
    customers: list[Customer]


# --- timelines.json -----------------------------------------------------------------------


class Timeline(_Strict):
    customer_id: int
    days: list[int]  # purchase days relative to the cutoff (<= 0 history, > 0 label window)
    revenue: list[float]


class TimelinesFile(_Strict):
    cutoff: date
    horizon_days: int
    timelines: list[Timeline]


# --- evaluation.json ----------------------------------------------------------------------


class Estimate(_Strict):
    value: float
    ci_low: float
    ci_high: float


class PRCurve(_Strict):
    recall: list[float]
    precision: list[float]


class ROCCurve(_Strict):
    fpr: list[float]
    tpr: list[float]


class GainsCurve(_Strict):
    fraction: list[float]
    captured: list[float]


class ReliabilityBin(_Strict):
    bin_low: float
    bin_high: float
    mean_p: float
    churn_rate: float
    n: int


class Curves(_Strict):
    pr: PRCurve
    roc: ROCCurve
    gains: GainsCurve
    reliability: list[ReliabilityBin]


class ModelEvaluation(_Strict):
    calibrator: CalibratorSpec
    mean_p: float
    metrics: dict[str, Estimate]
    emp_per_customer: Estimate
    curves: Curves


class PolicyRow(_Strict):
    policy: str
    n_contacted: int
    expected_profit: float | None
    realized_profit: float
    share_of_oracle: float | None
    random_same_k_profit: float
    realized_profit_ci_low: float
    realized_profit_ci_high: float


class StabilityRow(_Strict):
    cutoff: date
    role: Literal["calibration", "test", "out_of_time"]
    model: str
    n_customers: int
    churn_rate: float
    mean_p: float
    roc_auc: float
    pr_auc: float
    brier: float
    n_contacted: int
    expected_profit: float
    realized_profit: float


class DriftRow(_Strict):
    cutoff: date
    feature: str
    psi: float


class Split(_Strict):
    train: list[date]
    calibration: date
    test: date


class Population(_Strict):
    n_customers: int
    churn_rate: float


class ValueCheckRow(_Strict):
    """Customers who stayed: revenue the value formula predicted for the label window vs actual."""

    bucket: str
    min_purchase_days: int
    max_purchase_days: int | None  # None: no upper bound
    n: int
    predicted_revenue: float
    actual_revenue: float
    ratio: float | None  # predicted / actual; None when the bucket is empty


class EvaluationFile(_Strict):
    split: Split
    test_population: Population
    calibration_population: Population
    economics: EconomicParams
    models: dict[str, ModelEvaluation]
    policies: list[PolicyRow]
    stability: list[StabilityRow]
    drift: list[DriftRow]
    models_sha256: str | None = None  # fingerprint of the evaluated models (None for baselines)
    value_check: list[ValueCheckRow] | None = None  # added by `export`; absent in reports/


# --- experiments.json ---------------------------------------------------------------------


class RunSummary(_Strict):
    run_id: str
    model: str
    started_at: datetime
    tags: dict[str, str]
    params: dict[str, str]
    metrics: dict[str, float]
    trial_cv_log_loss: list[float]


class ExperimentsFile(_Strict):
    experiment: str
    runs: list[RunSummary]


# --- golden vectors -----------------------------------------------------------------------


class EconomicsCase(_Strict):
    params: EconomicParams
    aov_gg: float
    cadence_days: float
    p: Probability
    churn: Literal[0, 1]
    value: float
    crc: float
    cac: float
    benefit: float
    expected_profit: float
    break_even_p: float
    contact: bool
    expected_cost: float
    realized_profit: float


class BudgetCase(_Strict):
    expected_profit: list[float]
    expected_cost: list[float]
    budget: float | None
    max_contacts: int | None
    selected: list[bool]


class EconomicsGolden(_Strict):
    tolerance: float
    cases: list[EconomicsCase]
    budget_cases: list[BudgetCase]


class DerivedCase(_Strict):
    base: dict[str, float]
    derived: dict[str, float]


class DerivedGolden(_Strict):
    tolerance: float
    horizon_days: int
    cadence_floor_days: float
    spend_trend_eps: float
    cases: list[DerivedCase]


class ModelCase(_Strict):
    features: list[float]
    score: Probability  # native LightGBM churn probability (uncalibrated)
    p: Probability  # after the exported calibrator


class ModelGolden(_Strict):
    model: str
    tolerance: float
    order: list[str]
    cases: list[ModelCase]


class GammaGammaCase(_Strict):
    params: GammaGammaSpec
    n_purchase_days: float
    avg_order_value: float
    aov_gg: float


class GammaGammaGolden(_Strict):
    tolerance: float
    cases: list[GammaGammaCase]


# --- manifest.json ------------------------------------------------------------------------


class ModelInfo(_Strict):
    name: str
    label: str
    family: Literal["rule", "probabilistic", "linear", "gbdt"]
    deployable: bool  # True only for the model served as ONNX


class Manifest(_Strict):
    contract_version: str
    created_at: datetime
    git_sha: str
    data_sha256: str
    config_sha256: str
    deployed_model: str
    test_cutoff: date
    models: list[ModelInfo]  # the ladder, in order
    files: dict[str, str]  # artifact path -> SHA-256


SCHEMAS: dict[str, type[BaseModel]] = {
    "manifest": Manifest,
    "customers": CustomersFile,
    "timelines": TimelinesFile,
    "evaluation": EvaluationFile,
    "experiments": ExperimentsFile,
    "feature_spec": FeatureSpec,
    "calibrator": CalibratorFile,
    "golden_economics": EconomicsGolden,
    "golden_derived_features": DerivedGolden,
    "golden_model": ModelGolden,
    "golden_gamma_gamma": GammaGammaGolden,
}


def schema_documents() -> dict[str, str]:
    """``<name>.schema.json`` file name -> canonical JSON text (sorted keys, LF, final newline)."""
    return {
        f"{name}.schema.json": json.dumps(model.model_json_schema(), indent=2, sort_keys=True)
        + "\n"
        for name, model in SCHEMAS.items()
    }


def write_schemas(schemas_dir: Path) -> list[Path]:
    schemas_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for file_name, text in schema_documents().items():
        path = schemas_dir / file_name
        path.write_text(text, encoding="utf-8", newline="\n")
        written.append(path)
    return written
