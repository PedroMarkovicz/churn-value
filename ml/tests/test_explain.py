import numpy as np
import pandas as pd
import pytest

from churnvalue.explain import cutoff_baseline, explain, global_importance, top_contributions
from churnvalue.features import CONTEXT_FEATURES
from churnvalue.models import SUPERVISED, feature_matrix

SPEC = SUPERVISED["lightgbm_seasonal"]


@pytest.fixture(scope="module")
def explained(trained_synthetic, snapshots_synthetic: pd.DataFrame):
    _, estimators = trained_synthetic
    frame = snapshots_synthetic.loc[snapshots_synthetic["cutoff"] == "2011-09-10"]
    x = feature_matrix(frame, SPEC)
    estimator = estimators[SPEC.name]
    return estimator, x, explain(estimator, x, SPEC.features)


def test_shap_values_add_up_to_the_raw_log_odds(explained):
    estimator, x, explanation = explained
    raw = estimator.booster_.predict(x, raw_score=True)
    assert explanation.values.shape == x.shape
    assert explanation.values.sum(axis=1) + explanation.expected_value == pytest.approx(raw)


def test_cutoff_baseline_folds_in_the_month_terms(explained):
    _, _, explanation = explained
    context = [SPEC.features.index(f) for f in CONTEXT_FEATURES]
    expected = explanation.expected_value + explanation.values[:, context].sum(axis=1)
    assert cutoff_baseline(explanation) == pytest.approx(expected)


def test_top_contributions_rank_customer_features_by_magnitude(explained):
    _, x, explanation = explained
    tops = top_contributions(explanation, x, k=3)
    assert len(tops) == x.shape[0]
    for row, top in enumerate(tops):
        assert len(top) == 3
        assert not {c["feature"] for c in top} & set(CONTEXT_FEATURES)
        magnitudes = [abs(float(c["shap"])) for c in top]
        assert magnitudes == sorted(magnitudes, reverse=True)
        first = SPEC.features.index(str(top[0]["feature"]))
        assert top[0]["value"] == x[row, first]
        assert top[0]["shap"] == explanation.values[row, first]


def test_global_importance_is_mean_absolute_shap(explained):
    _, _, explanation = explained
    importance = global_importance(explanation)
    assert list(importance.index) != [] and importance.is_monotonic_decreasing
    feature = importance.index[0]
    column = explanation.frame()[feature]
    assert importance.iloc[0] == pytest.approx(np.abs(column).mean())
