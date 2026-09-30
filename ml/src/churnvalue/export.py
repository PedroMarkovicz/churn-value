"""Build the versioned artifacts the static site reads (design §6.2), validated on write."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import numpy as np
import onnxruntime as ort
import pandas as pd
from onnxmltools.convert import convert_lightgbm
from onnxmltools.convert.common.data_types import FloatTensorType
from pydantic import BaseModel

from churnvalue.btyd import GammaGammaParams, gamma_gamma_expected_aov
from churnvalue.calibration import calibrator_from_dict
from churnvalue.config import Config
from churnvalue.contract import (
    CONTRACT_VERSION,
    CalibratorFile,
    Contribution,
    Customer,
    CustomersFile,
    EvaluationFile,
    ExperimentsFile,
    FeatureEntry,
    FeatureSpec,
    GammaGammaSpec,
    Manifest,
    ModelInfo,
    PipelineInfo,
    Timeline,
    TimelinesFile,
)
from churnvalue.evaluate import CalibratedScorer, Scorer, temporal_split
from churnvalue.explain import (
    Explanation,
    cutoff_baseline,
    explain,
    global_importance,
    top_contributions,
)
from churnvalue.features import CONTEXT_FEATURES, FEATURE_CATALOGUE, SPEND_TREND_EPS, purchase_days
from churnvalue.golden import model_golden
from churnvalue.model_card import render_model_card
from churnvalue.models import LADDER, SUPERVISED, ModelSpec, feature_matrix
from churnvalue.provenance import config_sha256, git_sha
from churnvalue.training import load_training
from churnvalue.value_check import value_backtest

ONNX_INPUT = "features"
ONNX_OUTPUT = "probabilities"  # (n, 2): column 1 is the churn probability
ONNX_OPSET = 15
INTEGER_FEATURES = frozenset(
    {
        "recency_days",
        "n_purchase_days",
        "tenure_days",
        "n_distinct_products",
        "purchases_90d",
        "bought_same_window_last_year",
        "is_uk",
    }
)


def deployed_spec(cfg: Config) -> ModelSpec:
    spec = SUPERVISED.get(cfg.training.deployed_model)
    if spec is None or spec.kind != "lightgbm":
        raise ValueError(
            f"deployed_model must be a LightGBM model in {sorted(SUPERVISED)}; "
            f"got {cfg.training.deployed_model!r}"
        )
    return spec


def to_onnx(estimator: Any, n_features: int) -> bytes:
    model = convert_lightgbm(
        estimator,
        initial_types=[(ONNX_INPUT, FloatTensorType([None, n_features]))],
        zipmap=False,
        target_opset=ONNX_OPSET,
    )
    return model.SerializeToString()


def onnx_churn_probability(model: bytes, x: np.ndarray) -> np.ndarray:
    options = ort.SessionOptions()
    options.log_severity_level = 3  # the converter's scalar `label` shape warns on every run
    session = ort.InferenceSession(model, options)
    outputs = session.run([ONNX_OUTPUT], {ONNX_INPUT: x.astype(np.float32)})
    return np.asarray(outputs[0])[:, 1].astype(np.float64)


GAMMA_GAMMA_COLUMNS = ("gg_p", "gg_q", "gg_v")


def served_gamma_gamma(test: pd.DataFrame) -> GammaGammaSpec:
    """The test cutoff's Gamma-Gamma fit; refuses if it does not reproduce every served aov_gg."""
    fits = test[list(GAMMA_GAMMA_COLUMNS)].drop_duplicates()
    if len(fits) != 1:
        raise ValueError(f"expected one Gamma-Gamma fit on the test cutoff, found {len(fits)}")
    p, q, v = (float(x) for x in fits.iloc[0])
    recomputed = gamma_gamma_expected_aov(
        GammaGammaParams(p, q, v), test["n_purchase_days"], test["avg_order_value"]
    )
    gap = float(np.max(np.abs(recomputed / test["aov_gg"].to_numpy() - 1.0)))
    if gap > 1e-9:
        raise RuntimeError(f"Gamma-Gamma parameters reproduce aov_gg only to {gap:.2e}")
    return GammaGammaSpec(p=p, q=q, v=v)


def ladder_info(names: list[str], deployed: str) -> list[ModelInfo]:
    """Presentation metadata for every evaluated model, in ladder order."""
    unknown = [name for name in names if name not in LADDER]
    if unknown:
        raise ValueError(f"models without a LADDER entry in churnvalue.models: {unknown}")
    return [
        ModelInfo(
            name=name,
            label=LADDER[name].label,
            family=LADDER[name].family,
            deployable=name == deployed,
        )
        for name in names
    ]


def feature_spec(snapshots: pd.DataFrame, cfg: Config, spec: ModelSpec) -> FeatureSpec:
    """Feature order, catalogue metadata and valid ranges.

    Ranges span the training cutoffs and the served (test) cutoff: history-length features
    such as tenure grow with the data, so training-only ranges would exclude the very
    customers the web app shows.
    """
    split = temporal_split(snapshots, cfg)
    support = snapshots.loc[snapshots["cutoff"].isin([*split.train, split.test])]
    test = snapshots.loc[snapshots["cutoff"] == split.test]
    entries = []
    for name in spec.features:
        info = FEATURE_CATALOGUE[name]
        entries.append(
            FeatureEntry(
                name=name,
                group=info.group,  # type: ignore[arg-type]
                unit=info.unit,
                description=info.description,
                editable=info.editable,
                dtype="int" if name in INTEGER_FEATURES else "float",
                min=float(support[name].min()),
                max=float(support[name].max()),
            )
        )
    return FeatureSpec(
        order=list(spec.features),
        features=entries,
        horizon_days=cfg.snapshots.horizon_days,
        cadence_floor_days=cfg.snapshots.cadence_floor_days,
        spend_trend_eps=SPEND_TREND_EPS,
        context={name: float(test[name].iloc[0]) for name in CONTEXT_FEATURES},
        onnx_input=ONNX_INPUT,
        onnx_output=ONNX_OUTPUT,
        gamma_gamma=served_gamma_gamma(test),
    )


def customers_file(
    test: pd.DataFrame,
    models: dict[str, CalibratedScorer],
    explanation: Explanation,
    spec: ModelSpec,
    cfg: Config,
) -> CustomersFile:
    """The test cutoff's customers: every model's p, the model inputs and top SHAP reasons."""
    x = feature_matrix(test, spec)
    baseline = cutoff_baseline(explanation)
    tops = top_contributions(explanation, x)
    probabilities = {name: model.predict(test) for name, model in models.items()}
    customers = []
    for i, row in enumerate(test.itertuples(index=False)):
        customers.append(
            Customer(
                customer_id=int(row.customer_id),  # type: ignore[arg-type]
                churn=int(row.churn),  # type: ignore[arg-type]
                p={name: float(p[i]) for name, p in probabilities.items()},
                features={name: float(x[i, j]) for j, name in enumerate(spec.features)},
                aov_gg=float(row.aov_gg),  # type: ignore[arg-type]
                cadence_days=float(row.cadence_days),  # type: ignore[arg-type]
                shap_baseline=float(baseline[i]),
                top_contributions=[Contribution.model_validate(c) for c in tops[i]],
            )
        )
    return CustomersFile(
        cutoff=pd.Timestamp(test["cutoff"].iloc[0]).date(),
        horizon_days=cfg.snapshots.horizon_days,
        models=list(models),
        deployed_model=spec.name,
        customers=customers,
    )


def timelines_file(
    tx: pd.DataFrame, customer_ids: pd.Series, cutoff: pd.Timestamp, horizon_days: int
) -> TimelinesFile:
    """Purchase days up to the end of the label window, relative to the cutoff."""
    end = cutoff + pd.Timedelta(days=horizon_days)
    days = purchase_days(tx.loc[tx["customer_id"].isin(customer_ids) & (tx["date"] <= end)])
    days["offset"] = (days["date"] - cutoff).dt.days
    grouped = {cid: g for cid, g in days.groupby("customer_id")}
    timelines = [
        Timeline(
            customer_id=int(cid),
            days=[int(d) for d in grouped[cid]["offset"]],
            revenue=[round(float(r), 2) for r in grouped[cid]["revenue"]],
        )
        for cid in customer_ids
    ]
    return TimelinesFile(cutoff=cutoff.date(), horizon_days=horizon_days, timelines=timelines)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _json_bytes(model: BaseModel) -> bytes:
    # Pydantic serialises dates/datetimes as ISO strings; NaN is impossible (validated floats).
    return (model.model_dump_json(indent=None) + "\n").encode("utf-8")


@dataclass(frozen=True)
class ExportResult:
    manifest: Manifest
    importance: pd.Series  # mean |SHAP| on the test cutoff, for the model card
    evaluation: dict[str, Any]  # as served: the evaluation report plus the value backtest
    model_card: str  # as served in model_card.md


MODEL_CARD_FILE = "model_card.md"


def pipeline_info(cfg: Config, trained: dict[str, Any]) -> PipelineInfo:
    """The settings of the run that produced the deployed model, from its training record."""
    return PipelineInfo(
        seed=cfg.training.seed,
        n_trials=len(trained["trial_values"]),
        n_folds=len(trained["folds"]),
        horizon_days=cfg.snapshots.horizon_days,
        eligibility_f=cfg.snapshots.eligibility_f,
    )


def export_artifacts(
    cfg: Config,
    snapshots: pd.DataFrame,
    transactions: pd.DataFrame,
    scorers: dict[str, Scorer],
    estimator: Any,
    evaluation: dict[str, Any],
    experiments: dict[str, Any],
    training: dict[str, dict[str, Any]] | None = None,
) -> ExportResult:
    """Write every artifact to ``cfg.artifacts_dir`` and a manifest with their checksums."""
    spec = deployed_spec(cfg)
    split = temporal_split(snapshots, cfg)
    test = snapshots.loc[snapshots["cutoff"] == split.test].reset_index(drop=True)
    if list(evaluation["models"]) != list(scorers):
        raise ValueError("the evaluation report and the scorers list different models")
    value_check = value_backtest(test, transactions, split.test, cfg.snapshots.horizon_days)
    served = {**evaluation, "value_check": [row.model_dump() for row in value_check]}
    evaluation_file = EvaluationFile.model_validate(served)
    calibrators = {
        name: calibrator_from_dict(body["calibrator"])
        for name, body in evaluation["models"].items()
    }
    models = {name: CalibratedScorer(scorers[name], calibrators[name]) for name in scorers}

    onnx_model = to_onnx(estimator, len(spec.features))
    x_test = feature_matrix(test, spec)
    native = estimator.predict_proba(x_test)[:, 1]
    parity = float(np.max(np.abs(onnx_churn_probability(onnx_model, x_test) - native)))
    if parity > 1e-5:
        raise RuntimeError(f"ONNX and native predictions differ by {parity:.2e} on the test rows")

    explanation = explain(estimator, x_test, spec.features)
    payloads: dict[str, bytes] = {
        "customers.json": _json_bytes(customers_file(test, models, explanation, spec, cfg)),
        "timelines.json": _json_bytes(
            timelines_file(
                transactions, test["customer_id"], split.test, cfg.snapshots.horizon_days
            )
        ),
        "evaluation.json": _json_bytes(evaluation_file),
        "experiments.json": _json_bytes(ExperimentsFile.model_validate(experiments)),
        "feature_spec.json": _json_bytes(feature_spec(snapshots, cfg, spec)),
        "calibrator.json": _json_bytes(
            CalibratorFile.model_validate(
                {"model": spec.name, "calibrator": calibrators[spec.name].to_dict()}
            )
        ),
        "model.onnx": onnx_model,
        "golden/model.json": _json_bytes(
            model_golden(estimator, spec, calibrators[spec.name], test)
        ),
    }
    if training is None:
        training = load_training(cfg.models_dir)
    metadata: dict[str, Any] = {
        "contract_version": CONTRACT_VERSION,
        "created_at": datetime.now(UTC),
        "git_sha": git_sha(),
        "data_sha256": cfg.data.sha256,
        "config_sha256": config_sha256(cfg),
        "deployed_model": spec.name,
        "test_cutoff": split.test.date(),
        "models": ladder_info(list(scorers), spec.name),
        "pipeline": pipeline_info(cfg, training[spec.name]),
    }
    importance = global_importance(explanation)
    # The card reads the manifest's metadata, never its checksums, so it can be listed in them.
    card = render_model_card(Manifest(**metadata, files={}), served, training, importance)
    payloads[MODEL_CARD_FILE] = card.encode("utf-8")

    out_dir = cfg.artifacts_dir
    for relative, data in payloads.items():
        path = out_dir / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    manifest = Manifest(
        **metadata,
        files={relative: sha256_bytes(data) for relative, data in payloads.items()},
    )
    (out_dir / "manifest.json").write_text(manifest.model_dump_json(indent=2) + "\n", "utf-8")
    return ExportResult(manifest, importance, served, card)
