"""SHAP explanations of the tree model, in log-odds of the uncalibrated score (design §5.4)."""

from __future__ import annotations

import warnings
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
import shap
from numpy.typing import NDArray

from churnvalue.features import CONTEXT_FEATURES

FloatArray = NDArray[np.float64]
TOP_K = 5


@dataclass(frozen=True)
class Explanation:
    values: FloatArray  # (n_customers, n_features) log-odds contributions
    expected_value: float  # mean log-odds over the training data
    features: tuple[str, ...]

    def frame(self) -> pd.DataFrame:
        return pd.DataFrame(self.values, columns=list(self.features))


def explain(estimator: Any, x: FloatArray, features: tuple[str, ...]) -> Explanation:
    """Exact TreeSHAP; values plus the expected value add up to the model's raw log-odds."""
    explainer = shap.TreeExplainer(estimator)
    with warnings.catch_warnings():  # shap warns that its LightGBM output format changed
        warnings.simplefilter("ignore", UserWarning)
        values = explainer.shap_values(x)
    values = values[1] if isinstance(values, list) else values  # older shap: one array per class
    expected = np.atleast_1d(explainer.expected_value)[-1]
    return Explanation(np.asarray(values, dtype=np.float64), float(expected), features)


def global_importance(explanation: Explanation) -> pd.Series:
    """Mean |SHAP| per feature, largest first."""
    importance = pd.Series(np.abs(explanation.values).mean(axis=0), index=explanation.features)
    return importance.sort_values(ascending=False)


def cutoff_baseline(explanation: Explanation) -> FloatArray:
    """Log-odds before any customer feature: expected value plus the context (month) terms.

    On one cutoff every customer shares the same month, so the context terms move all customers
    alike; they are folded into this baseline instead of competing with customer features.
    """
    context = [i for i, f in enumerate(explanation.features) if f in CONTEXT_FEATURES]
    return explanation.expected_value + explanation.values[:, context].sum(axis=1)


def top_contributions(
    explanation: Explanation, x: FloatArray, k: int = TOP_K
) -> list[list[dict[str, float | str]]]:
    """Per customer, the ``k`` customer features with the largest |SHAP|, with their values."""
    customer = [i for i, f in enumerate(explanation.features) if f not in CONTEXT_FEATURES]
    out = []
    for row in range(explanation.values.shape[0]):
        contributions = explanation.values[row, customer]
        order = np.argsort(-np.abs(contributions), kind="stable")[:k]
        out.append(
            [
                {
                    "feature": explanation.features[customer[j]],
                    "value": float(x[row, customer[j]]),
                    "shap": float(contributions[j]),
                }
                for j in order
            ]
        )
    return out
